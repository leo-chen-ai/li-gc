import os
import re
import time
import logging
import base64
import shutil
import unicodedata
from datetime import datetime

from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import (
    TimeoutException,
    NoSuchElementException,
    ElementClickInterceptedException,
    StaleElementReferenceException,
)
from browser_runtime import create_driver

logger = logging.getLogger(__name__)

PROJECT_LIST_URL = "https://tg.91jtg.com/#/project/index"

LOGIN_URL = "http://tg.91jtg.com/#/login"
MAX_CAPTCHA_RETRIES = 5
PAGE_LOAD_TIMEOUT = 30
DOWNLOAD_WAIT_TIMEOUT = 120


def _normalized_project_name(value):
    return unicodedata.normalize("NFKC", str(value)).strip()


class Downloader:
    def __init__(self, config):
        self.config = config
        self.creds = config['credentials']['source_site']
        self.download_settings = config['download']
        self.browser_config = config['browser']

        self.date_str = datetime.now().strftime('%Y%m%d')
        self.download_dir = os.path.abspath(
            os.path.join(self.browser_config['download_dir'], self.date_str)
        )
        os.makedirs(self.download_dir, exist_ok=True)

        self.driver = None
        self.wait = None

    def _init_driver(self):
        self.driver = create_driver(
            self.download_dir,
            headless=self.browser_config.get('headless', True),
        )
        self.driver.set_page_load_timeout(PAGE_LOAD_TIMEOUT)
        self.driver.implicitly_wait(5)
        self.wait = WebDriverWait(self.driver, 15)
        logger.info("Chromium 浏览器已启动")

    def discover_projects(self):
        """Log in and read every source project without downloading files."""
        try:
            if not self.login():
                raise RuntimeError("源站登录失败")
            if not self._enter_project_list():
                raise RuntimeError("未进入项目列表")
            names = []
            while True:
                page_names = self._get_current_page_project_names()
                for name in page_names:
                    if name not in names:
                        names.append(name)
                if not self._need_next_page(set(names)):
                    break
            logger.info("项目读取完成，共 %s 个", len(names))
            return names
        finally:
            self.close()

    def _solve_captcha(self, image_element):
        try:
            import ddddocr
            ocr = ddddocr.DdddOcr(show_ad=False)
        except ImportError:
            logger.error("ddddocr 未安装，请运行: pip install ddddocr")
            return None

        try:
            img_bytes = image_element.screenshot_as_png

            result = ocr.classification(img_bytes)
            logger.info(f"验证码 OCR 原始结果: {result}")

            match = re.search(r'(\d)\s*([+\-*/×÷xXtT])\s*(\d)', result)
            if not match:
                logger.warning(f"无法解析验证码表达式: {result}")
                return None

            a = int(match.group(1))
            op = match.group(2)
            b = int(match.group(3))

            if op in ('x', 'X', '×', '*', 't', 'T'):
                answer = a * b
            elif op in ('÷', '/'):
                answer = a // b if b != 0 else None
            elif op == '+':
                answer = a + b
            elif op == '-':
                answer = a - b
            else:
                logger.warning(f"未知运算符: {op}")
                return None

            if answer is not None:
                logger.info(f"验证码计算: {a} {op} {b} = {answer}")
            return str(int(answer))

        except Exception as e:
            logger.error(f"验证码识别异常: {e}")
            return None

    def login(self):
        self._init_driver()
        logger.info(f"正在打开登录页面: {LOGIN_URL}")
        self.driver.get(LOGIN_URL)
        time.sleep(3)

        for attempt in range(MAX_CAPTCHA_RETRIES):
            try:
                logger.info(f"登录尝试 {attempt + 1}/{MAX_CAPTCHA_RETRIES}")

                username_input = self.wait.until(
                    EC.presence_of_element_located((By.XPATH, "//input[@placeholder='请输入用户名']"))
                )
                password_input = self.driver.find_element(By.XPATH, "//input[@placeholder='请输入密码']")
                captcha_input = self.driver.find_element(By.XPATH, "//input[@placeholder='请输入验证码']")
                captcha_img = self.driver.find_element(By.XPATH, "//img[contains(@src,'/code?')]")
                login_btn = self.driver.find_element(By.XPATH, "//button[contains(@class,'login-submit')]")

                username_input.clear()
                username_input.send_keys(self.creds['username'])
                password_input.clear()
                password_input.send_keys(self.creds['password'])

                captcha_input.clear()
                answer = self._solve_captcha(captcha_img)
                if answer is None:
                    logger.warning("验证码识别失败，刷新验证码重试")
                    captcha_img.click()
                    time.sleep(1)
                    continue

                captcha_input.send_keys(answer)
                time.sleep(0.5)

                login_btn.click()
                logger.info("已点击登录按钮")
                # Element UI 的错误提示默认只显示几秒。先在提示消失前记录
                # 服务端给出的具体原因，再等待页面跳转完成，避免把账号、
                # 密码、验证码等完全不同的问题都误报成“可能验证码错误”。
                time.sleep(1)
                feedback = self._login_feedback()
                if feedback:
                    logger.warning("源站登录响应: %s", feedback)
                time.sleep(2)

                if self._check_login_success():
                    logger.info("登录成功!")
                    return True
                else:
                    logger.warning("登录未成功，可能验证码错误，刷新重试")
                    try:
                        captcha_img = self.driver.find_element(By.XPATH, "//img[contains(@src,'/code?')]")
                        captcha_img.click()
                    except Exception:
                        pass
                    time.sleep(1)
                    continue

            except TimeoutException:
                logger.error("页面加载超时")
                break
            except Exception as e:
                logger.error(f"登录异常: {e}")
                time.sleep(1)

        logger.error(f"登录失败，已重试 {MAX_CAPTCHA_RETRIES} 次")
        return False

    def _login_feedback(self):
        selectors = (
            ".el-message__content",
            ".el-notification__content",
            ".el-message-box__message",
        )
        messages = []
        # These are optional error messages. With the driver's normal 5-second
        # implicit wait, checking three absent selectors costs 15 seconds on every
        # successful login. Disable the implicit wait only for this snapshot.
        self.driver.implicitly_wait(0)
        try:
            for selector in selectors:
                for element in self.driver.find_elements(By.CSS_SELECTOR, selector):
                    try:
                        text = element.text.strip()
                        if element.is_displayed() and text and text not in messages:
                            messages.append(text)
                    except StaleElementReferenceException:
                        continue
        finally:
            self.driver.implicitly_wait(5)
        return "；".join(messages)

    def _check_login_success(self):
        try:
            self.driver.find_element(By.XPATH, "//input[@placeholder='请输入用户名']")
            return False
        except NoSuchElementException:
            return True

    def download_all(self):
        try:
            if not self._enter_project_list():
                return []

            downloaded = []
            page = 1
            all_processed_names = set()

            while True:
                logger.info(f"=== 处理第 {page} 页 ===")
                self._navigate_to_project_list()
                time.sleep(3)

                page_names = self._get_current_page_project_names()
                if not page_names:
                    logger.info("当前页无项目，结束")
                    break

                filtered = self._filter_projects(page_names)
                logger.info(f"第 {page} 页: {len(page_names)} 个项目, 过滤后 {len(filtered)} 个: {filtered}")

                new_on_page = 0
                for project_name in filtered:
                    if project_name in all_processed_names:
                        logger.info(f"项目已处理过，跳过: {project_name}")
                        continue
                    all_processed_names.add(project_name)
                    new_on_page += 1
                    try:
                        result = self._click_and_download(project_name)
                        if result:
                            downloaded.append(result)
                    except Exception as e:
                        logger.error(f"下载项目 {project_name} 异常: {e}")
                    finally:
                        self._navigate_to_project_list()
                        time.sleep(3)

                if self._selected_projects_complete(all_processed_names):
                    logger.info("配置的项目均已处理，停止翻页")
                    break

                if new_on_page == 0:
                    logger.info("当前页无新项目，分页结束")
                    break

                if not self._need_next_page(all_processed_names):
                    break
                page += 1

            logger.info(f"下载完成，共成功 {len(downloaded)} 个文件")
            return downloaded

        except Exception as e:
            logger.error(f"下载流程异常: {e}")
            return []

    def _enter_project_list(self):
        """Support both the legacy jump page and accounts landing on home directly."""
        logger.info("检查登录后的源站入口...")
        skip_btn = self._find_and_click(
            By.XPATH,
            "//*[contains(text(),'跳转')]",
            description="跳转按钮",
            timeout=5,
            warn_on_timeout=False,
        )
        if skip_btn:
            logger.info("检测到旧版跳转入口，继续进入系统首页")
            time.sleep(5)
        else:
            logger.info("未显示跳转按钮，按直接进入系统首页的方式继续")

        logger.info("寻找'项目(工地)总数'...")
        project_btn = self._find_and_click(
            By.XPATH,
            "//*[contains(text(),'项目') and contains(text(),'总数')]",
            description="项目(工地)总数",
        )
        if not project_btn:
            logger.error("登录后既未进入可用首页，也未找到项目(工地)总数")
            return False
        time.sleep(3)
        return True

    def _check_expired(self):
        try:
            tips = self.driver.find_elements(
                By.XPATH, "//*[contains(text(),'项目已过期')]"
            )
            visible_tip = None
            for tip in tips:
                if tip.is_displayed():
                    visible_tip = tip
                    break

            if not visible_tip:
                return False

            try:
                btn = self.driver.find_element(
                    By.XPATH, "//button[contains(.,'知道了')]"
                )
                if btn.is_displayed():
                    self.driver.execute_script("arguments[0].click();", btn)
                    logger.info("已点击'知道了'关闭过期提示")
                    time.sleep(2)
                    try:
                        WebDriverWait(self.driver, 5).until_not(
                            EC.visibility_of(btn)
                        )
                    except Exception:
                        pass
            except Exception:
                try:
                    btn2 = self.driver.find_element(
                        By.XPATH, "//div[contains(@class,'el-message-box')]//button[contains(@class,'primary')]"
                    )
                    if btn2.is_displayed():
                        self.driver.execute_script("arguments[0].click();", btn2)
                        logger.info("已点击弹窗确认按钮")
                        time.sleep(2)
                except Exception:
                    pass
            return True
        except Exception:
            return False
        return False

    def _find_and_click(
        self, by, value, description="", timeout=10, warn_on_timeout=True
    ):
        try:
            element = WebDriverWait(self.driver, timeout).until(
                EC.element_to_be_clickable((by, value))
            )
            try:
                element.click()
            except ElementClickInterceptedException:
                self.driver.execute_script("arguments[0].click();", element)
            logger.info(f"已点击: {description}")
            return element
        except TimeoutException:
            log = logger.warning if warn_on_timeout else logger.info
            log(f"未找到可点击元素: {description}")
            return None

    def _get_current_page_project_names(self):
        links = self.driver.find_elements(
            By.XPATH,
            "//div[contains(@class,'el-table__fixed')]//table//tbody//tr//td[2]//div//a"
        )
        names = []
        for link in links:
            text = link.text.strip()
            if text:
                names.append(text)
        return names

    def _need_next_page(self, processed_names):
        try:
            total_el = self.driver.find_element(
                By.XPATH,
                "//span[contains(@class,'el-pagination__total')]"
            )
            total_text = total_el.text.strip()
            import re as _re
            m = _re.search(r'(\d+)', total_text)
            if not m:
                logger.info("无法解析总数，停止翻页")
                return False
            total = int(m.group(1))
            processed = len(processed_names)
            logger.info(f"总项目数: {total}, 已处理: {processed}")
            if processed >= total:
                logger.info("已处理所有项目，停止")
                return False
            logger.info("还有未处理项目，翻页继续")
            next_btn = self.driver.find_element(
                By.XPATH, "//button[contains(@class,'btn-next')]"
            )
            self.driver.execute_script("arguments[0].click();", next_btn)
            time.sleep(3)
            return True
        except NoSuchElementException:
            logger.info("未找到分页信息，停止")
            return False
        except Exception as e:
            logger.info(f"翻页判断异常: {e}")
            return False

    def _filter_projects(self, project_names):
        include = self.download_settings.get('include_projects', 'all')
        exclude = self.download_settings.get('exclude_projects', [])

        if isinstance(include, str) and include.lower() == 'all':
            filtered = list(project_names)
        elif isinstance(include, list):
            included_names = {
                _normalized_project_name(name)
                for name in include
                if _normalized_project_name(name)
            }
            filtered = [
                p for p in project_names
                if _normalized_project_name(p) in included_names
            ]
        else:
            filtered = list(project_names)

        if exclude:
            excluded_names = {
                _normalized_project_name(name)
                for name in exclude
                if _normalized_project_name(name)
            }
            filtered = [
                p for p in filtered
                if _normalized_project_name(p) not in excluded_names
            ]

        return filtered

    def _selected_projects_complete(self, processed_names):
        include = self.download_settings.get('include_projects', 'all')
        if not isinstance(include, list):
            return False
        selected = {
            _normalized_project_name(name)
            for name in include
            if _normalized_project_name(name)
        }
        excluded = {
            _normalized_project_name(name)
            for name in self.download_settings.get('exclude_projects', [])
            if _normalized_project_name(name)
        }
        selected -= excluded
        processed = {_normalized_project_name(name) for name in processed_names}
        return bool(selected) and selected.issubset(processed)

    def _click_and_download(self, project_name):
        logger.info(f"点击项目: {project_name}")

        links = self.driver.find_elements(
            By.XPATH,
            "//div[contains(@class,'el-table__fixed')]//table//tbody//tr//td[2]//div//a"
        )
        target = None
        for link in links:
            if link.text.strip() == project_name:
                target = link
                break

        if not target:
            logger.error(f"未找到项目链接: {project_name}")
            return None

        try:
            target.click()
        except Exception:
            self.driver.execute_script("arguments[0].click();", target)
        logger.info(f"已点击项目，等待页面...")
        try:
            WebDriverWait(self.driver, 10).until(
                lambda d: d.execute_script('return document.readyState') in ('complete', 'interactive')
            )
        except TimeoutException:
            pass
        time.sleep(1)

        if self._check_expired():
            logger.warning(f"项目已过期，跳过: {project_name}")
            return None

        logger.info("点击'工人信息'标签...")
        worker_tab = self._find_and_click(
            By.XPATH, "//*[contains(text(),'工人信息')]",
            description="工人信息"
        )
        if not worker_tab:
            logger.error(f"未找到'工人信息'标签: {project_name}")
            return None
        time.sleep(2)

        files_before = set(os.listdir(self.download_dir))

        logger.info("点击'导出花名册'...")
        self._find_and_click(
            By.XPATH, "//span[text()='导出花名册'] | //button[span[text()='导出花名册']]",
            description="导出花名册", timeout=5
        )
        time.sleep(1)

        logger.info("点击弹窗'确定'按钮...")
        self._find_and_click(
            By.XPATH, "//div[contains(@class,'el-dialog__wrapper') and not(contains(@class,'hidden'))]//button[contains(.,'确定')]",
            description="确定", timeout=5
        )
        time.sleep(1)

        logger.info("选择'按照系统默认模板导出'...")
        self._find_and_click(
            By.XPATH, "//label[1]//span[contains(text(),'系统默认模板')]",
            description="按照系统默认模板导出", timeout=5
        )
        time.sleep(0.5)

        logger.info("点击'导出'按钮...")
        self._find_and_click(
            By.XPATH, "//div[contains(@class,'el-dialog__wrapper') and not(contains(@class,'hidden'))]//div[2]/button[contains(.,'导出')]",
            description="导出", timeout=5
        )

        downloaded_file = self._wait_for_download(files_before)
        if downloaded_file:
            new_name = f"{project_name}项目工人花名册.xlsx"
            new_path = os.path.join(self.download_dir, new_name)
            if downloaded_file != new_path:
                shutil.move(downloaded_file, new_path)
            logger.info(f"下载成功: {new_name}")
            return new_path
        else:
            logger.warning(f"下载超时或失败: {project_name}")
            return None

    def _wait_for_download(self, files_before, timeout=DOWNLOAD_WAIT_TIMEOUT):
        start = time.time()
        while time.time() - start < timeout:
            current_files = set(os.listdir(self.download_dir))
            new_files = current_files - files_before

            downloading = [f for f in new_files if f.endswith('.crdownload') or f.endswith('.tmp')]
            if downloading:
                time.sleep(1)
                continue

            completed = [f for f in new_files if f.endswith('.xlsx') and not f.startswith('~$')]
            if completed:
                return os.path.join(self.download_dir, completed[0])

            time.sleep(1)

        return None

    def _navigate_to_project_list(self):
        try:
            current_url = self.driver.current_url
            if PROJECT_LIST_URL not in current_url:
                logger.info(f"导航回项目列表页: {PROJECT_LIST_URL}")
                try:
                    self.driver.execute_script(f"window.location.href = '{PROJECT_LIST_URL}';")
                except Exception:
                    try:
                        self.driver.get(PROJECT_LIST_URL)
                    except TimeoutException:
                        pass
                try:
                    WebDriverWait(self.driver, 8).until(
                        lambda d: d.execute_script('return document.readyState') in ('complete', 'interactive')
                    )
                except TimeoutException:
                    pass
                time.sleep(2)
        except Exception:
            try:
                self.driver.execute_script(f"window.location.href = '{PROJECT_LIST_URL}';")
            except Exception:
                pass
            time.sleep(3)

    def close(self):
        if self.driver:
            try:
                self.driver.quit()
                logger.info("浏览器已关闭")
            except Exception:
                pass

    def run(self):
        try:
            if not self.login():
                logger.error("登录失败，终止下载")
                return []

            results = self.download_all()
            return results
        except Exception as e:
            logger.error(f"下载器运行异常: {e}")
            return []
        finally:
            self.close()

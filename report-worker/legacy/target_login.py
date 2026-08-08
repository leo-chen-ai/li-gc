import os
import re
import sys
import time
import subprocess
import logging
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
from browser_runtime import browser_profile_dir, close_driver, create_driver
from captcha_ocr import recognize_target_code

logger = logging.getLogger(__name__)

HOME_URL = "https://www.zjzwfw.gov.cn/zjservice-fe/#/home"
SMS_CODE_WAIT_TIMEOUT = 120
SMS_CODE_VALID_MINUTES = 5
CSV_POLL_INTERVAL = 2
LISTENER_STARTUP_WAIT = 5
MAX_CAPTCHA_RETRIES = 3
SMS_POPUP_WAIT = 10
SMS_RESEND_BUTTON_WAIT = 75


def attach_to_browser(debug_port=9222):
    raise RuntimeError("容器 Worker 不支持附加到外部浏览器")


def _find_first(driver, selectors, check_displayed=True):
    for by, value in selectors:
        els = driver.find_elements(by, value)
        for el in els:
            try:
                if not check_displayed or el.is_displayed():
                    return el
            except StaleElementReferenceException:
                continue
    return None


def _wait_and_find(driver, wait_selector, find_selectors, timeout=10, check_displayed=True):
    WebDriverWait(driver, timeout).until(
        EC.presence_of_element_located(wait_selector)
    )
    return _find_first(driver, find_selectors, check_displayed)


SMS_CODE_MAX_RETRIES = 3


class TargetLogin:
    def __init__(self, config):
        self.config = config
        self.creds = config['credentials']['target_site']
        self.script_dir = os.path.dirname(os.path.abspath(__file__))
        self.listener_proc = None
        self.driver = None
        self.long_wait = None
        self.short_wait = None
        self.sms_requested_at = None

    def _start_feishu_listener(self):
        listener_script = os.path.join(self.script_dir, 'feishu_listener.py')

        log_dir = os.path.join(self.script_dir, 'logs')
        os.makedirs(log_dir, exist_ok=True)
        log_file = os.path.join(log_dir, 'feishu_listener_out.log')

        self.listener_proc = subprocess.Popen(
            [sys.executable, listener_script],
            stdout=open(log_file, 'a'),
            stderr=subprocess.STDOUT,
            cwd=self.script_dir,
        )

        logger.info(f"飞书监听已启动 (PID: {self.listener_proc.pid})")

        for _ in range(LISTENER_STARTUP_WAIT):
            time.sleep(1)
            if self.listener_proc.poll() is not None:
                logger.error("飞书监听启动失败，进程已退出")
                return False

        csv_path = os.environ.get('REPORT_FORWARD_CODES_CSV', os.path.join(self.script_dir, 'verification_codes.csv'))
        logger.info(f"飞书监听运行中 (PID: {self.listener_proc.pid}, chat_id: 已配置)")
        logger.info(f"验证码输出: {csv_path}")
        return True

    def _stop_feishu_listener(self):
        if self.listener_proc is None:
            return
        if self.listener_proc.poll() is not None:
            return

        self.listener_proc.terminate()
        try:
            self.listener_proc.wait(timeout=10)
            logger.info("飞书监听已停止")
        except subprocess.TimeoutExpired:
            self.listener_proc.kill()
            logger.warning("飞书监听强制终止")

    def _init_driver(self):
        if self.driver is not None:
            return
        self.driver = create_driver(
            headless=self.config.get('browser', {}).get('headless', True),
            profile_dir=browser_profile_dir("target", self.creds['username']),
        )
        self.driver.set_page_load_timeout(30)
        self.driver.implicitly_wait(0)
        self.long_wait = WebDriverWait(self.driver, 15)
        self.short_wait = WebDriverWait(self.driver, 5)
        logger.info("Chromium 浏览器已启动")

    def _click_login_entry(self):
        logger.info(f"打开首页: {HOME_URL}")
        for _ in range(2):
            try:
                self.driver.get(HOME_URL)
                break
            except TimeoutException:
                logger.warning("页面加载超时，停止加载并检查已渲染内容...")
                try:
                    self.driver.execute_script('window.stop();')
                except Exception:
                    pass
                if _find_first(self.driver, [
                    (By.CSS_SELECTOR, "span.login"),
                    (By.CSS_SELECTOR, "span.loginBtn"),
                ]):
                    logger.info("首页交互内容已出现，继续登录")
                    break
                time.sleep(2)
        try:
            self.long_wait.until(
                lambda d: d.execute_script('return document.readyState') in ('complete', 'interactive')
            )
        except TimeoutException:
            logger.warning("页面加载超时，继续尝试...")
        time.sleep(3)

        logger.info("点击'登录'按钮")

        selectors = [
            (By.CSS_SELECTOR, "span.login"),
            (By.CSS_SELECTOR, "span.loginBtn"),
            (By.XPATH, "//span[text()='登录' and not(ancestor::*[contains(text(),'注销')])]"),
            (By.XPATH, "//li[contains(@class,'login')]//span"),
            (By.XPATH, "//*[contains(text(),'登录') and not(contains(text(),'注销'))]"),
            (By.LINK_TEXT, "登录"),
        ]

        clicked = False
        deadline = time.time() + 15
        while time.time() < deadline and not clicked:
            # 首页会同时渲染隐藏的页头入口和可见的“登录账号”入口。
            # element_to_be_clickable 只检查首个匹配项，容易卡在隐藏元素上。
            el = _find_first(self.driver, selectors, check_displayed=True)
            if el is None:
                time.sleep(0.3)
                continue
            try:
                self._click(el)
                logger.info("已点击登录入口")
                clicked = True
            except TimeoutException:
                try:
                    self.driver.execute_script('window.stop();')
                except Exception:
                    pass
                if 'user.zjzwfw.gov.cn' in self.driver.current_url or self.driver.find_elements(
                    By.XPATH, "//*[contains(text(),'法人用户登录')]"
                ):
                    logger.info("登录页已打开，忽略页面资源加载超时")
                    clicked = True
                else:
                    logger.info("登录入口点击超时，重新查找")
            except StaleElementReferenceException:
                logger.info("登录入口已刷新，重新查找后点击")
                time.sleep(0.3)

        if not clicked:
            raise RuntimeError("未找到登录入口")

        self.long_wait.until(
            lambda d: len(d.find_elements(By.XPATH, "//*[contains(text(),'法人')]")) > 0
            or len(d.window_handles) > 1
            or 'user.zjzwfw.gov.cn' in d.current_url
        )
        logger.info("登录弹窗已出现")

    def _switch_to_login_popup(self):
        for _ in range(3):
            time.sleep(0.5)
            try:
                if len(self.driver.window_handles) > 1:
                    for handle in self.driver.window_handles:
                        self.driver.switch_to.window(handle)
                        current = self.driver.current_url
                        if 'login' in current.lower() or 'oauth' in current.lower():
                            logger.info(f"切换到登录窗口: {current}")
                            return
            except Exception:
                pass

            try:
                self.driver.switch_to.default_content()
                iframes = self.driver.find_elements(By.TAG_NAME, "iframe")
                for iframe in iframes:
                    self.driver.switch_to.frame(iframe)
                    if self.driver.find_elements(By.XPATH, "//*[contains(text(),'法人')]"):
                        logger.info("已在登录弹窗 iframe 中")
                        return
                    self.driver.switch_to.default_content()
            except Exception:
                pass

        logger.info("假定登录弹窗在主页面 DOM 中")

    def _click_legal_person_login(self):
        logger.info("点击'法人用户登录'")
        selectors = [
            (By.XPATH, "//span[text()='法人用户登录']"),
            (By.XPATH, "//*[contains(text(),'法人用户登录')]"),
            (By.XPATH, "//span[contains(text(),'法人')]"),
        ]
        clicked = False
        for by, value in selectors:
            try:
                el = self.long_wait.until(EC.element_to_be_clickable((by, value)))
                self._click(el)
                clicked = True
                break
            except (TimeoutException, StaleElementReferenceException):
                continue

        if not clicked:
            raise RuntimeError("未找到'法人用户登录'")

        logger.info("已点击'法人用户登录'")

        self.long_wait.until(
            lambda d: len(d.find_elements(By.XPATH, "//input[@type='password']")) > 0
            or len(d.find_elements(By.XPATH, "//input[contains(@placeholder,'用户名')]")) > 0
        )
        logger.info("登录表单已加载")

    def _click_account_login(self):
        logger.info("点击'账号登录'")
        # Some government-login variants open directly on the account/password
        # form. Trying five absent tab selectors at 3 seconds each used to add a
        # fixed 15 seconds to every successful login.
        if _find_first(self.driver, [
            (By.XPATH, "//input[@type='password']"),
            (By.XPATH, "//input[contains(@placeholder,'用户名') or contains(@placeholder,'账号')]"),
        ]):
            logger.info("账号密码表单已直接可见，无需切换登录方式")
            return
        selectors = [
            (By.XPATH, "//li[text()='账号登录']"),
            (By.XPATH, "//li[contains(text(),'账号密码')]"),
            (By.XPATH, "//span[text()='账号登录']"),
            (By.XPATH, "//div[text()='账号登录']"),
            (By.XPATH, "//*[@role='tab' and contains(.,'账号')]"),
        ]
        for by, value in selectors:
            try:
                el = WebDriverWait(self.driver, 3).until(
                    EC.element_to_be_clickable((by, value))
                )
                self._click(el)
                logger.info("已点击'账号登录'")
                time.sleep(1)
                return
            except (TimeoutException, StaleElementReferenceException):
                continue

        logger.info("未找到'账号登录'tab，表单可能已直接可见")

    def _fill_credentials(self):
        logger.info("填写用户名和密码")

        username_input = _wait_and_find(
            self.driver,
            (By.XPATH, "//input[@type='text' or contains(@placeholder,'用户名') or contains(@placeholder,'账号')]"),
            [
                (By.XPATH, "//input[@placeholder='请输入用户名']"),
                (By.XPATH, "//input[contains(@placeholder,'用户名')]"),
                (By.XPATH, "//input[@type='text' and not(contains(@placeholder,'验证码')) and not(contains(@placeholder,'图片'))]"),
            ],
            timeout=10,
        )
        if not username_input:
            raise RuntimeError("未找到用户名输入框")

        username_input.clear()
        username_input.send_keys(self.creds['username'])

        password_input = _find_first(self.driver, [
            (By.XPATH, "//input[@type='password']"),
            (By.XPATH, "//input[@placeholder='请输入密码']"),
        ])
        if not password_input:
            raise RuntimeError("未找到密码输入框")

        password_input.clear()
        password_input.send_keys(self.creds['password'])

        logger.info("用户名和密码已填写")

    def _solve_image_captcha(self):
        logger.info("识别图片验证码")

        captcha_img = self._find_captcha_image()
        if not captcha_img:
            try:
                captcha_img = self.long_wait.until(
                    EC.presence_of_element_located(
                        (By.XPATH, "//input[@placeholder='请输入图片验证码']/../img")
                    )
                )
            except TimeoutException:
                logger.error("未找到验证码图片")
                return None

        for ocr_attempt in range(3):
            self.short_wait.until(lambda d: captcha_img.size.get('height', 0) > 10)
            img_bytes = captcha_img.screenshot_as_png

            if len(img_bytes) < 100:
                logger.warning(f"验证码图片太小 ({len(img_bytes)} bytes)，可能未加载，刷新重试...")
                self._refresh_captcha()
                captcha_img = self._find_captcha_image()
                if not captcha_img:
                    return None
                continue

            cleaned, details = recognize_target_code(img_bytes)
            logger.info("验证码 OCR 投票结果: %s (%s)", cleaned, details)

            if cleaned:

                captcha_input = self._find_captcha_input()
                if not captcha_input:
                    logger.error("未找到验证码输入框")
                    return None

                captcha_input.clear()
                captcha_input.send_keys(cleaned)
                logger.info(f"验证码已填入: {cleaned}")
                return cleaned

            logger.warning(f"OCR 识别低置信度或不一致 (attempt {ocr_attempt + 1})，刷新验证码重试")
            self._refresh_captcha()
            captcha_img = self._find_captcha_image()
            if not captcha_img:
                return None

        logger.error("验证码识别全部失败")
        return None

    def _find_captcha_image(self):
        result = _find_first(self.driver, [
            (By.XPATH, "//input[@placeholder='请输入图片验证码']/../../../div[last()]/img"),
            (By.XPATH, "//input[@placeholder='请输入图片验证码']/../../img"),
            (By.XPATH, "//input[@placeholder='请输入图片验证码']/../img"),
            (By.XPATH, "//input[contains(@placeholder,'验证码')]/../img"),
            (By.XPATH, "//input[contains(@placeholder,'验证码')]/following-sibling::img"),
            (By.XPATH, "//label[contains(text(),'验证码')]/..//img"),
            (By.XPATH, "//label[contains(text(),'验证码')]/following-sibling::div//img"),
            (By.XPATH, "//img[contains(@src,'captcha')]"),
            (By.XPATH, "//img[contains(@src,'code')]"),
            (By.XPATH, "//img[contains(@src,'verify')]"),
            (By.XPATH, "//div[contains(@class,'captcha')]//img"),
        ], check_displayed=True)
        if result:
            return result

        for img in self.driver.find_elements(By.TAG_NAME, "img"):
            try:
                src = img.get_attribute('src') or ''
                if any(k in src.lower() for k in ('captcha', 'code', 'verify', 'kaptcha')):
                    if img.is_displayed():
                        return img
            except Exception:
                continue
        return None

    def _find_captcha_input(self):
        return _find_first(self.driver, [
            (By.XPATH, "//input[@placeholder='请输入图片验证码']"),
            (By.XPATH, "//input[contains(@placeholder,'图片验证码')]"),
            (By.XPATH, "//input[@placeholder='请输入验证码']"),
            (By.XPATH, "//input[contains(@placeholder,'验证码') and not(contains(@placeholder,'密码'))]"),
            (By.XPATH, "//label[contains(text(),'验证码')]/following-sibling::div//input"),
            (By.XPATH, "//label[contains(text(),'验证码')]/..//input"),
        ])

    def _refresh_captcha(self):
        captcha_img = self._find_captcha_image()
        if captcha_img:
            try:
                self._click(captcha_img)
                logger.info("已刷新验证码")
                time.sleep(0.5)
            except Exception:
                pass

    def _click_login_button(self):
        logger.info("点击登录按钮")
        selectors = [
            (By.XPATH, "//input[@type='submit' and contains(@value,'登录')]"),
            (By.XPATH, "//input[@value='登录']"),
            (By.XPATH, "//button[text()='登录']"),
            (By.XPATH, "//button[contains(text(),'登') and contains(text(),'录')]"),
            (By.XPATH, "//*[@type='submit']"),
            (By.XPATH, "//span[text()='登录']/parent::button"),
            (By.XPATH, "//div[contains(@class,'login')]//button"),
        ]
        for _ in range(3):
            btn = _find_first(self.driver, selectors, check_displayed=False)
            try:
                if btn and btn.is_enabled():
                    self.sms_requested_at = datetime.now()
                    self._click(btn)
                    logger.info("已点击登录")
                    time.sleep(2)
                    return True
            except StaleElementReferenceException:
                logger.info("登录按钮已刷新，重新查找后点击")
                time.sleep(0.3)

        logger.warning("未找到登录按钮，尝试用回车提交")
        try:
            password_input = _find_first(self.driver, [
                (By.XPATH, "//input[@type='password']"),
            ])
            if password_input:
                self.sms_requested_at = datetime.now()
                password_input.send_keys('\n')
                time.sleep(2)
                return True
        except Exception:
            pass

        return False

    def _check_sms_popup_appeared(self):
        logger.info("检查短信验证码弹窗是否出现")
        start = time.time()
        while time.time() - start < SMS_POPUP_WAIT:
            inputs = self.driver.find_elements(By.XPATH, "//input[@maxlength='1']")
            visible = [i for i in inputs if i.is_displayed()]
            if len(visible) >= 5:
                logger.info(f"检测到短信验证码弹窗 ({len(visible)} 个输入框)")
                return True
            time.sleep(0.5)
        return False

    def _wait_for_sms_code(self, timeout=SMS_CODE_WAIT_TIMEOUT, exclude_code=None, requested_at=None):
        logger.info(f"等待短信验证码（超时 {timeout} 秒）")

        csv_path = os.environ.get('REPORT_FORWARD_CODES_CSV', os.path.join(self.script_dir, 'verification_codes.csv'))

        start = time.time()
        while time.time() - start < timeout:
            try:
                from feishu_listener import get_latest_valid_code
                code = get_latest_valid_code(
                    csv_path,
                    max_age_minutes=SMS_CODE_VALID_MINUTES,
                    received_after=requested_at or self.sms_requested_at,
                )
                if code:
                    if exclude_code and code == exclude_code:
                        elapsed = int(time.time() - start)
                        if elapsed % 10 < 2:
                            logger.info(f"验证码已尝试过，等待新验证码... (已等待 {elapsed}秒)")
                        time.sleep(CSV_POLL_INTERVAL)
                        continue
                    logger.info("获取到有效验证码")
                    return code
            except Exception as e:
                logger.error(f"读取验证码异常: {e}")

            elapsed = int(time.time() - start)
            if elapsed % 10 < 2:
                logger.info(f"等待验证码中... (已等待 {elapsed}秒)")

            time.sleep(CSV_POLL_INTERVAL)

        logger.error(f"等待验证码超时 ({timeout}秒)")
        return None

    def _resend_sms_code(self):
        logger.info("等待并点击重新发送短信验证码")
        selectors = [
            (By.XPATH, "//button[contains(text(),'重新发送') or contains(text(),'重新获取') or contains(text(),'发送验证码') or contains(text(),'获取验证码')]"),
            (By.XPATH, "//*[self::span or self::a][contains(text(),'重新发送') or contains(text(),'重新获取') or contains(text(),'发送验证码') or contains(text(),'获取验证码')]"),
        ]
        deadline = time.time() + SMS_RESEND_BUTTON_WAIT
        while time.time() < deadline:
            element = _find_first(self.driver, selectors, check_displayed=True)
            if element is not None:
                try:
                    disabled = element.get_attribute("disabled") is not None
                    class_name = element.get_attribute("class") or ""
                    if not disabled and "disabled" not in class_name:
                        self._click(element)
                        self.sms_requested_at = datetime.now()
                        logger.info("已重新发送短信验证码")
                        return self.sms_requested_at
                except StaleElementReferenceException:
                    pass
            time.sleep(1)
        logger.error("等待重新发送短信验证码按钮超时")
        return None

    def _fill_sms_code(self, code):
        logger.info("填写短信验证码")

        inputs = self.driver.find_elements(By.XPATH, "//input[@maxlength='1']")
        visible_inputs = [i for i in inputs if i.is_displayed()]

        if len(visible_inputs) < 6:
            try:
                visible_inputs = self.long_wait.until(
                    lambda d: [
                        i for i in d.find_elements(By.XPATH, "//div[contains(@class,'sms') or contains(@class,'code')]//input")
                        if i.is_displayed()
                    ]
                )
            except TimeoutException:
                pass

        if len(visible_inputs) < 6:
            try:
                visible_inputs = self.long_wait.until(
                    lambda d: [
                        i for i in d.find_elements(By.XPATH, "//input[@type='text' and @maxlength='1']")
                        if i.is_displayed()
                    ]
                )
            except TimeoutException:
                pass

        logger.info(f"找到 {len(visible_inputs)} 个验证码输入框")

        for i, digit in enumerate(code):
            if i >= len(visible_inputs):
                logger.warning(f"输入框不足，第 {i} 位 {digit} 无法填入")
                break
            el = visible_inputs[i]
            try:
                el.click()
                el.clear()
                el.send_keys(digit)
                time.sleep(0.1)
            except Exception as e:
                logger.error(f"填入第 {i+1} 位异常: {e}")

        logger.info("短信验证码已填写")

    def _check_sms_code_error(self):
        els = self.driver.find_elements(By.XPATH, "//div[contains(text(),'短信验证码有误')]")
        for el in els:
            if el.is_displayed():
                logger.warning("检测到错误提示: 短信验证码有误，请重试")
                return True
        return False

    def _clear_sms_inputs(self):
        logger.info("清空短信验证码输入框")
        inputs = self.driver.find_elements(By.XPATH, "//input[@maxlength='1']")
        visible_inputs = [i for i in inputs if i.is_displayed()]
        if len(visible_inputs) < 6:
            inputs = self.driver.find_elements(By.XPATH, "//input[@type='text' and @maxlength='1']")
            visible_inputs = [i for i in inputs if i.is_displayed()]
        for el in visible_inputs[:6]:
            try:
                el.clear()
            except Exception:
                pass

    def _confirm_login(self):
        logger.info("点击确认登录")
        selectors = [
            (By.XPATH, "//button[text()='确认登录']"),
            (By.XPATH, "//button[contains(text(),'确认登录')]"),
            (By.XPATH, "//button[contains(text(),'确定')]"),
            (By.XPATH, "//button[contains(text(),'确认')]"),
            (By.XPATH, "//div[contains(@class,'dialog')]//button[contains(text(),'登录')]"),
            (By.XPATH, "//div[contains(@class,'dialog')]//button[last()]"),
            (By.XPATH, "//button[contains(@class,'primary')]"),
        ]

        btn = _find_first(self.driver, selectors, check_displayed=False)

        if not btn:
            try:
                btn = self.long_wait.until(
                    lambda d: _find_first(d, selectors, check_displayed=False)
                )
            except TimeoutException:
                pass

        if btn and btn.is_enabled():
            self._click(btn)
            logger.info("已点击确认登录")
            time.sleep(3)
            return True

        logger.error("未找到确认登录按钮，本次登录失败")
        return False

    def _click(self, element):
        try:
            element.click()
        except ElementClickInterceptedException:
            try:
                self.driver.execute_script("arguments[0].click();", element)
            except Exception:
                pass
        except Exception:
            self.driver.execute_script("arguments[0].click();", element)

    def _check_captcha_error(self):
        els = self.driver.find_elements(By.XPATH, "//*[contains(text(),'图片验证码错误') or contains(text(),'验证码错误')]")
        for el in els:
            if el.is_displayed():
                logger.warning("检测到: 图片验证码错误，请刷新重试")
                return True
        return False

    def _reuse_existing_session(self):
        logger.info("检查目标政务网持久登录状态")
        try:
            self.driver.get(HOME_URL)
            time.sleep(3)
            if self._check_login_success():
                logger.info("复用目标政务网已有登录状态")
                return True
        except Exception as error:
            logger.info("目标政务网登录状态复用失败，将重新登录: %s", error)
        return False

    def login(self, reuse_session=True):
        self._init_driver()

        if reuse_session and self._reuse_existing_session():
            return True

        self._click_login_entry()

        self._switch_to_login_popup()

        self._click_legal_person_login()

        self._click_account_login()

        self._fill_credentials()

        for attempt in range(MAX_CAPTCHA_RETRIES):
            logger.info(f"验证码尝试 {attempt + 1}/{MAX_CAPTCHA_RETRIES}")
            captcha = self._solve_image_captcha()
            if captcha is None:
                logger.warning("验证码识别/填入失败，刷新重试")
                self._refresh_captcha()
                continue

            if not self._click_login_button():
                logger.error("未找到登录按钮")
                return False

            if self._check_captcha_error():
                logger.warning("图片验证码错误，刷新重试...")
                self._refresh_captcha()
                continue

            if self._check_sms_popup_appeared():
                break

            logger.warning("短信弹窗未出现，验证码可能错误，刷新重试")
            self._refresh_captcha()
        else:
            logger.error(f"验证码重试 {MAX_CAPTCHA_RETRIES} 次后仍未进入短信弹窗")
            return False

        code = self._wait_for_sms_code(requested_at=self.sms_requested_at)
        if not code:
            logger.error("未能获取短信验证码")
            return False

        for sms_attempt in range(SMS_CODE_MAX_RETRIES):
            logger.info(f"短信验证码提交 {sms_attempt + 1}/{SMS_CODE_MAX_RETRIES}")
            self._fill_sms_code(code)
            if not self._confirm_login():
                return False

            time.sleep(1)
            if not self._check_sms_code_error():
                break

            logger.warning("短信验证码有误，清空输入，等待新验证码...")
            self._clear_sms_inputs()
            requested_at = self._resend_sms_code()
            if not requested_at:
                return False
            new_code = self._wait_for_sms_code(exclude_code=code, requested_at=requested_at)
            if not new_code:
                logger.error("未能获取新的短信验证码")
                return False
            code = new_code
        else:
            logger.error(f"短信验证码重试 {SMS_CODE_MAX_RETRIES} 次后仍然错误")
            return False

        return self._check_login_success()

    def _check_login_success(self):
        time.sleep(2)
        try:
            self.driver.switch_to.default_content()
        except Exception:
            pass

        current_url = self.driver.current_url
        logger.info(f"当前 URL: {current_url}")

        if 'login' in current_url.lower():
            logger.warning("可能仍在登录页面")
            return False

        visible_sms_inputs = [
            element for element in self.driver.find_elements(By.XPATH, "//input[@maxlength='1']")
            if element.is_displayed()
        ]
        if visible_sms_inputs:
            logger.warning("短信验证码弹窗仍然可见，登录未完成")
            return False

        logout = _find_first(self.driver, [
            (By.XPATH, "//span[contains(text(),'注销')]"),
            (By.XPATH, "//*[contains(text(),'退出登录')]"),
        ])
        if logout:
            logger.info("检测到退出登录入口，登录成功")
            return True

        login_entry = _find_first(self.driver, [
            (By.XPATH, "//span[normalize-space(text())='登录']"),
            (By.XPATH, "//a[normalize-space(text())='登录']"),
        ])
        if login_entry:
            logger.warning("首页仍显示登录入口，登录状态校验失败")
            return False

        logger.info("登录入口已消失且短信弹窗已关闭，登录成功")
        return True

    def close(self):
        self._stop_feishu_listener()
        if self.driver:
            try:
                close_driver(self.driver)
                logger.info("浏览器已关闭")
            except Exception as e:
                logger.warning(f"关闭浏览器异常: {e}")

    def run(self):
        try:
            self._init_driver()
            if self._reuse_existing_session():
                return True
            if not self._start_feishu_listener():
                logger.error("飞书监听启动失败")
                return False

            return self.login(reuse_session=False)

        except Exception as e:
            logger.error(f"登录流程异常: {e}", exc_info=True)
            return False

        finally:
            self.close()

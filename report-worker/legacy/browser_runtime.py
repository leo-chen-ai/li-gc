import hashlib
import json
import os
import tempfile

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service


def browser_profile_dir(site, username):
    base = os.environ.get("REPORT_FORWARD_BROWSER_PROFILES", "/data/browser-profiles")
    account_hash = hashlib.sha256(str(username).encode("utf-8")).hexdigest()[:20]
    path = os.path.join(base, site, account_hash)
    os.makedirs(path, mode=0o700, exist_ok=True)
    return path


def _cookie_store_path(profile_dir):
    return os.path.join(profile_dir, "session-cookies.json")


def _restore_session_cookies(driver, profile_dir):
    path = _cookie_store_path(profile_dir)
    if not os.path.exists(path):
        return
    try:
        with open(path, "r", encoding="utf-8") as handle:
            cookies = json.load(handle)
        if cookies:
            driver.execute_cdp_cmd("Network.setCookies", {"cookies": cookies})
    except Exception:
        # A stale/corrupt cookie cache must never prevent a fresh login.
        return


def save_session_cookies(driver):
    profile_dir = getattr(driver, "_shanhuai_profile_dir", None)
    if not profile_dir:
        return
    try:
        raw_cookies = driver.execute_cdp_cmd("Network.getAllCookies", {}).get("cookies", [])
        allowed_fields = {
            "name", "value", "url", "domain", "path", "secure", "httpOnly",
            "sameSite", "expires", "priority", "sameParty", "sourceScheme", "sourcePort",
        }
        cookies = [
            {key: value for key, value in cookie.items() if key in allowed_fields}
            for cookie in raw_cookies
        ]
        fd, temporary_path = tempfile.mkstemp(prefix="session-cookies-", dir=profile_dir)
        try:
            os.fchmod(fd, 0o600)
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(cookies, handle, ensure_ascii=False)
            os.replace(temporary_path, _cookie_store_path(profile_dir))
        except Exception:
            try:
                os.close(fd)
            except OSError:
                pass
            try:
                os.unlink(temporary_path)
            except OSError:
                pass
            raise
    except Exception:
        # Chromium's own profile is still useful even when explicit cookie export fails.
        return


def close_driver(driver):
    if not driver:
        return
    save_session_cookies(driver)
    driver.quit()


def create_driver(download_dir=None, headless=True, profile_dir=None):
    options = Options()
    # Dynamic government pages continue loading analytics and secondary assets
    # long after the interactive DOM is ready. Waiting for "complete" makes
    # clicks block until the 30-second page timeout and leaves stale elements.
    options.page_load_strategy = "eager"
    binary = os.environ.get("CHROMIUM_BINARY", "/usr/bin/chromium")
    if os.path.exists(binary):
        options.binary_location = binary
    if headless:
        options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    options.add_argument("--window-size=1920,1080")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("--lang=zh-CN")
    if profile_dir:
        os.makedirs(profile_dir, mode=0o700, exist_ok=True)
        options.add_argument(f"--user-data-dir={os.path.abspath(profile_dir)}")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    if download_dir:
        options.add_experimental_option("prefs", {
            "download.default_directory": os.path.abspath(download_dir),
            "download.prompt_for_download": False,
            "download.directory_upgrade": True,
            "safebrowsing.enabled": True,
        })
    driver_path = os.environ.get("CHROMEDRIVER_BINARY", "/usr/bin/chromedriver")
    service = Service(executable_path=driver_path) if os.path.exists(driver_path) else Service()
    driver = webdriver.Chrome(service=service, options=options)
    if profile_dir:
        driver._shanhuai_profile_dir = os.path.abspath(profile_dir)
        _restore_session_cookies(driver, driver._shanhuai_profile_dir)
    return driver

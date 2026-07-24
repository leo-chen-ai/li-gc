import os

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service


def create_driver(download_dir=None, headless=True):
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
    return webdriver.Chrome(service=service, options=options)

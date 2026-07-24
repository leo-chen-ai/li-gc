import os
import re
import csv
import json
import time
import logging
import yaml
from datetime import datetime

import lark_oapi as lark
from lark_oapi.api.im.v1 import ListMessageRequest

logger = logging.getLogger(__name__)

VALID_CODE_WINDOW_MINUTES = 5
VERIFICATION_CODE_PATTERN = re.compile(r'您获取的验证码为[：:](\d{6})')
SMS_TIME_PATTERN = re.compile(r'→短信时间[：:](.+)')

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.environ.get('REPORT_FORWARD_CODES_CSV', os.path.join(SCRIPT_DIR, 'verification_codes.csv'))
PROCESSED_IDS_FILE = os.environ.get('REPORT_FORWARD_PROCESSED_IDS', os.path.join(SCRIPT_DIR, '.processed_ids.txt'))


def load_config(config_path=None):
    if config_path is None:
        config_path = os.environ.get('REPORT_FORWARD_CONFIG_PATH', os.path.join(SCRIPT_DIR, 'config.yaml'))
    with open(config_path, 'r', encoding='utf-8') as f:
        return yaml.safe_load(f)


def load_processed_ids() -> set:
    if not os.path.exists(PROCESSED_IDS_FILE):
        return set()
    with open(PROCESSED_IDS_FILE, 'r', encoding='utf-8') as f:
        processed = set(line.strip() for line in f if line.strip())
        if len(processed) > 10000:
            processed = set(sorted(processed)[-5000:])
        return processed


def save_processed_ids(processed: set):
    with open(PROCESSED_IDS_FILE, 'w', encoding='utf-8') as f:
        for mid in processed:
            f.write(mid + '\n')


def check_message_time(create_time) -> bool:
    create_time = int(create_time)
    msg_time = datetime.fromtimestamp(create_time / 1000)
    now = datetime.now()

    if msg_time.date() != now.date():
        return False

    if abs((now - msg_time).total_seconds()) > VALID_CODE_WINDOW_MINUTES * 60:
        return False

    return True


def extract_text_from_content(content_str: str) -> str:
    try:
        body = json.loads(content_str)
        if 'text' in body:
            return body['text']
        if 'content' in body:
            return body['content']
        return content_str
    except (json.JSONDecodeError, TypeError):
        return content_str


def parse_message(text: str) -> tuple[str | None, str | None]:
    code_match = VERIFICATION_CODE_PATTERN.search(text)
    code = code_match.group(1) if code_match else None

    sms_match = SMS_TIME_PATTERN.search(text)
    sms_time = sms_match.group(1).strip() if sms_match else None

    return code, sms_time


def write_csv(code: str, sms_time: str | None, raw_message: str):
    file_exists = os.path.exists(CSV_PATH)
    with open(CSV_PATH, 'a', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        if not file_exists:
            writer.writerow(['code', 'sms_time', 'raw_message', 'received_at'])
        now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        writer.writerow([code, sms_time or '', raw_message, now_str])


def get_latest_valid_code(csv_path=None, max_age_minutes=5):
    if csv_path is None:
        csv_path = CSV_PATH

    if not os.path.exists(csv_path):
        return None

    try:
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.reader(f)
            header = next(reader, None)
            rows = list(reader)

        if not rows:
            return None

        last_row = rows[-1]
        if len(last_row) < 4:
            return None

        code = last_row[0].strip()
        received_at_str = last_row[3].strip()

        if not code or not received_at_str:
            return None

        received_at = datetime.strptime(received_at_str, '%Y-%m-%d %H:%M:%S')
        now = datetime.now()

        age_seconds = abs((now - received_at).total_seconds())
        if age_seconds > max_age_minutes * 60:
            logger.debug(f"验证码已过期 (接收时间: {received_at_str}, 年龄: {age_seconds:.0f}s)")
            return None

        logger.info(f"找到有效验证码 (接收时间: {received_at_str}, 年龄: {age_seconds:.0f}s)")
        return code

    except Exception as e:
        logger.error(f"读取验证码CSV异常: {e}")
        return None


def process_message(message, processed_ids: set):
    msg_id = message.message_id
    if msg_id in processed_ids:
        return

    processed_ids.add(msg_id)

    if not check_message_time(message.create_time):
        return

    content_str = message.body.content if message.body else None
    if not content_str:
        return

    text = extract_text_from_content(content_str)
    if not text:
        return

    code, sms_time = parse_message(text)
    if code:
        logger.info(f"提取到验证码，短信时间: {sms_time}")
        write_csv(code, sms_time, text)
        print(f"\n{'='*50}")
        print("  验证码: ******")
        print(f"  短信时间: {sms_time}")
        print(f"  接收时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"{'='*50}\n")
    else:
        logger.debug(f"未找到验证码, msg_id={msg_id}")


def poll_messages(client: lark.Client, chat_id: str, processed_ids: set):
    request = ListMessageRequest.builder() \
        .container_id_type("chat") \
        .container_id(chat_id) \
        .sort_type("ByCreateTimeDesc") \
        .page_size(20) \
        .build()

    response = client.im.v1.message.list(request)
    if not response.success():
        logger.error(f"拉取消息失败: code={response.code}, msg={response.msg}")
        return

    items = response.data.items
    if not items:
        return

    logger.debug(f"拉取到 {len(items)} 条消息")

    for message in items:
        try:
            process_message(message, processed_ids)
        except Exception as e:
            logger.error(f"处理消息异常: {e}", exc_info=True)


def main():
    config = load_config()

    feishu_config = config.get('feishu', {})
    app_id = feishu_config.get('app_id', '')
    app_secret = feishu_config.get('app_secret', '')
    chat_id = feishu_config.get('chat_id', '')
    poll_interval = feishu_config.get('poll_interval', 5)

    if not app_id or not app_secret:
        logger.error("请在 config.yaml 中配置 feishu.app_id 和 feishu.app_secret")
        return
    if not chat_id:
        logger.error("请在 config.yaml 中配置 feishu.chat_id")
        return

    client = lark.Client.builder() \
        .app_id(app_id) \
        .app_secret(app_secret) \
        .log_level(lark.LogLevel.INFO) \
        .build()

    processed_ids = load_processed_ids()
    logger.info(f"已加载 {len(processed_ids)} 条已处理消息ID")

    print(f"\n{'='*50}")
    print(f"  飞书消息轮询监听已启动")
    print("  群聊: 已配置")
    print(f"  轮询间隔: {poll_interval}s")
    print(f"  验证码窗口: {VALID_CODE_WINDOW_MINUTES} 分钟")
    print(f"  CSV: {CSV_PATH}")
    print(f"  按 Ctrl+C 停止")
    print(f"{'='*50}\n")

    next_save = time.time() + 300

    while True:
        try:
            poll_messages(client, chat_id, processed_ids)
        except Exception as e:
            logger.error(f"轮询异常: {e}", exc_info=True)

        if time.time() > next_save:
            save_processed_ids(processed_ids)
            next_save = time.time() + 300

        time.sleep(poll_interval)


if __name__ == '__main__':
    log_dir = os.path.join(SCRIPT_DIR, 'logs')
    os.makedirs(log_dir, exist_ok=True)

    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
        handlers=[
            logging.FileHandler(
                os.path.join(log_dir, f'{datetime.now().strftime("%Y%m%d")}.log'),
                encoding='utf-8',
            ),
            logging.StreamHandler(),
        ],
    )

    logging.getLogger('Lark').setLevel(logging.WARNING)

    main()

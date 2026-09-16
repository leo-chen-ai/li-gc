"""华瑆 API 登录、项目分页与人员花名册适配。Token 仅驻留本次任务内存。"""
import json
import logging
import re
from datetime import datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import openpyxl


class HuaxingDownloader:
    BASE_URL = "https://hx99.xin"

    def __init__(self, config):
        self.config = config
        self.token = None
        self.uid = None
        self.check_cancelled = config.get("check_cancelled", lambda: None)

    def _request(self, path, params=None, body=None):
        self.check_cancelled()
        url = self.BASE_URL + path
        if params:
            url += "?" + urlencode(params)
        headers = {"Accept": "application/json", "Content-Type": "application/json", "Referer": self.BASE_URL + "/"}
        if self.token:
            headers["token"] = self.token
        request = Request(url, data=json.dumps(body).encode() if body is not None else None, headers=headers)
        try:
            with urlopen(request, timeout=30) as response:
                payload = json.load(response)
        except (HTTPError, URLError, ValueError) as error:
            # Do not include response bodies, credentials or worker records in logs.
            raise RuntimeError(f"华瑆接口请求失败：{path} ({type(error).__name__})") from None
        if not isinstance(payload, dict) or payload.get("code") != 200:
            raise RuntimeError(f"华瑆接口未成功：{path}，请检查账号权限或重新登录")
        return payload.get("data")

    def login(self):
        creds = self.config["credentials"]["source_site"]
        result = self._request("/api/system/login", body={"username": creds["username"], "password": creds["password"], "terminal": 1})
        if not isinstance(result, dict) or not result.get("token"):
            raise RuntimeError("华瑆登录未返回 Token")
        if result.get("isResetPassword") is False:
            raise RuntimeError("华瑆账号需要先在网站完成首次修改密码")
        self.token = result["token"]
        user = self._request("/api/system/admin/self")
        self.uid = (user.get("user") or {}).get("id") if isinstance(user, dict) else None
        if self.uid is None:
            raise RuntimeError("华瑆登录未返回当前用户 ID")
        return True

    def _pages(self, path, params):
        seen = set()
        page = 1
        while True:
            data = self._request(path, {**params, "pageNo": page, "pageSize": 100})
            if not isinstance(data, dict) or not isinstance(data.get("lists"), list):
                raise RuntimeError("华瑆分页返回格式异常")
            rows = data["lists"]
            try:
                total = int(data["count"])
            except (KeyError, TypeError, ValueError):
                raise RuntimeError("华瑆分页缺少有效总数") from None
            if not rows:
                if len(seen) < total:
                    raise RuntimeError("华瑆分页提前结束，请重新执行")
                return
            for row in rows:
                if not isinstance(row, dict) or row.get("id") is None or row["id"] in seen:
                    raise RuntimeError("华瑆分页存在重复或无效记录，已停止避免遗漏")
                seen.add(row["id"])
                yield row
            if len(seen) >= total:
                return
            page += 1
            if page > 10000:
                raise RuntimeError("华瑆分页超过安全上限")

    def _projects(self):
        if not self.token:
            self.login()
        include = self.config["download"]["include_projects"]
        exclude = set(self.config["download"].get("exclude_projects", []))
        found = {}
        for keyword in ([""] if include == "all" else include):
            for project in self._pages("/api/api/project/list", {"projectName": keyword, "contractor": "", "addressCode": "", "buildUnit": ""}):
                name = str(project.get("projectName") or "").strip()
                if name and name not in exclude and (include == "all" or name in include):
                    found[project["id"]] = project
        names = [p["projectName"] for p in found.values()]
        if len(set(names)) != len(names):
            raise RuntimeError("华瑆存在同名项目，请先消除歧义后报送")
        if include != "all" and set(include) - exclude - set(names):
            raise RuntimeError("华瑆未找到部分指定项目，请检查完整项目名称和账号权限")
        return list(found.values())

    def discover_projects(self):
        try:
            return [p["projectName"] for p in self._projects()]
        finally:
            self.close()

    def run(self):
        try:
            files = []
            directory = Path(self.config["browser"]["download_dir"]) / datetime.now().strftime("%Y%m%d")
            directory.mkdir(parents=True, exist_ok=True)
            for project in self._projects():
                workers = list(self._pages("/api/api/worker/list", {
                    "name": "", "participatingUnitId": 0, "teamId": 0,
                    "projectId": project["id"], "uid": self.uid, "workStatus": 0,
                }))
                name = project["projectName"]
                if re.search(r'[/\\\x00-\x1f]', name):
                    raise RuntimeError("华瑆项目名称包含不支持的文件名字符")
                path = directory / f"{name}花名册.xlsx"
                write_roster(path, workers)
                files.append(str(path))
                logging.info("华瑆项目人员获取完成，共 %s 条，随后按进场天数筛选", len(workers))
            return files
        finally:
            self.close()

    def close(self):
        self.token = None
        self.uid = None


def write_roster(path, workers):
    """Map observed hx99 worker fields to the existing converter's roster layout."""
    workbook = openpyxl.Workbook()
    sheet = workbook.active
    sheet.title = "花名册"
    sheet.append(["华瑆网站工人花名册"])
    sheet.append([])
    sheet.append(["序号", "姓名", "", "性别", "", "身份证号", "住址", "", "", "", "手机号", "", "", "最新进场时间"])
    for index, worker in enumerate(workers, 1):
        # createTime/updateTime are record timestamps, never entry-date substitutes.
        if "entryTime" not in worker and "entry_time" not in worker:
            raise RuntimeError("华瑆人员数据缺少进场时间字段，已停止以避免错误报送")
        values = [index, worker.get("name"), "", {"0": "女", "1": "男"}.get(str(worker.get("sex")), ""), "",
                  worker.get("idCard"), worker.get("address"), "", "", "", worker.get("phone"), "", "",
                  worker.get("entryTime") or worker.get("entry_time")]
        for column, value in enumerate(values, 1):
            cell = sheet.cell(index + 3, column, value)
            if isinstance(value, str):
                cell.data_type = "s"
    workbook.save(path)
    workbook.close()

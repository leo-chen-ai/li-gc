use chrono::Utc;
use reqwest::{Client, StatusCode, Url};
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{collections::HashSet, env, net::IpAddr, time::Duration};
use thiserror::Error;

pub const PLATFORM_CODE: &str = "ningbo_housing";
pub const DEFAULT_BASE_URL: &str = "http://183.136.157.18:7334";
const OFFICIAL_HOST: &str = "183.136.157.18";
const MAX_RESPONSE_BYTES: usize = 1024 * 1024;
const MAX_TEAM_LIST_PAGES: i64 = 100;

#[derive(Debug, Error)]
pub enum NingboHousingError {
    #[error("市住建平台配置缺少 {0}")]
    MissingConfig(&'static str),
    #[error("市住建平台项目 ID 必须是 1–2147483647 范围内的整数")]
    InvalidProjectId,
    #[error("市住建平台接口地址不受信任")]
    UntrustedBaseUrl,
    #[error("市住建平台请求失败：{0}")]
    Request(String),
    #[error("市住建平台响应超过 1 MiB 限制")]
    ResponseTooLarge,
    #[error("市住建平台响应无法解析")]
    InvalidResponse,
}

#[derive(Debug, Clone)]
pub struct NingboHousingCredentials {
    pub base_url: Url,
    pub app_key: String,
    pub app_secret: String,
    pub project_id: i32,
    pub project_guid: String,
}

impl NingboHousingCredentials {
    pub fn from_config(config: &Value) -> Result<Self, NingboHousingError> {
        let base_url = config_string(config, &["base_url", "url", "endpoint", "host"])
            .unwrap_or_else(|| DEFAULT_BASE_URL.to_owned());
        let base_url = validate_base_url(&base_url)?;
        let app_key = required_config_string(config, &["app_key", "appKey", "AppKey"], "AppKey")?;
        let app_secret = required_config_string(
            config,
            &["app_secret", "appSecret", "AppSecret"],
            "AppSecret",
        )?;
        let project_id = required_config_string(
            config,
            &["project_id", "projectId", "ProjectApartmentId"],
            "平台项目 ID",
        )?
        .parse::<i32>()
        .map_err(|_| NingboHousingError::InvalidProjectId)?;
        if project_id <= 0 {
            return Err(NingboHousingError::InvalidProjectId);
        }
        let project_guid = required_config_string(
            config,
            &["project_guid", "projectGuid", "ProjectGuid", "guid"],
            "项目 GUID",
        )?;

        Ok(Self {
            base_url,
            app_key,
            app_secret,
            project_id,
            project_guid,
        })
    }

    pub fn endpoint(&self, path: &str) -> Result<Url, NingboHousingError> {
        self.base_url
            .join(path.trim_start_matches('/'))
            .map_err(|_| NingboHousingError::UntrustedBaseUrl)
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "PascalCase")]
pub struct AddOrUpdateWorkerRequest {
    pub worker_name: String,
    pub identity_card: String,
    pub address: String,
    pub grant_org: String,
    pub id_card_expire_date: Option<String>,
    pub marital_status: Option<String>,
    pub telephone: String,
    pub national_name: String,
    pub nation_name: String,
    pub id_card_photo: String,
    pub political_aff_name: String,
    pub culture_level_type_name: String,
    pub edu_level_name: Option<String>,
    pub degree_name: Option<String>,
    pub has_bad_medical_history: bool,
    pub private_string_suit: Option<String>,
    pub urgent_link_man: Option<String>,
    pub urgent_link_man_phone: Option<String>,
    pub worker_type: i32,
    pub is_joined: bool,
    pub joined_time: Option<String>,
    pub temporary_residence_permit_card: Option<String>,
    pub positive_id_card_file: Option<String>,
    pub negative_id_card_file: Option<String>,
    pub face_photo: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "PascalCase")]
pub struct AddEnterpriseWorkerRequest {
    pub enterprise_name: String,
    pub corp_code: String,
    pub worker_code: String,
    pub work_date: String,
    pub current_work_type_name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "PascalCase")]
pub struct AddProjectWorkerRequest {
    pub project_apartment_id: i32,
    pub team_id: i64,
    pub worker_code: String,
    pub is_team_leader: bool,
    pub work_type_name: String,
    pub entry_time: String,
    pub entry_attach_file: Option<String>,
    pub entry_attach_file_extension: Option<String>,
    pub issue_card_date: Option<String>,
    pub issue_card_pic: Option<String>,
    pub issue_card_pic_extension: Option<String>,
    pub card_number: Option<String>,
    pub pay_roll_bank_card_number: Option<String>,
    pub bank_link_number: Option<String>,
    pub pay_roll_top_bank_code: Option<String>,
    pub has_buy_insurance: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "PascalCase")]
pub struct EditProjectWorkerRequest {
    pub project_apartment_id: i32,
    pub project_worker_id: i64,
    pub is_team_leader: bool,
    pub work_type_name: String,
    pub entry_time: String,
    pub entry_attach_file: Option<String>,
    pub entry_attach_file_extension: Option<String>,
    pub issue_card_date: Option<String>,
    pub issue_card_pic: Option<String>,
    pub issue_card_pic_extension: Option<String>,
    pub card_number: Option<String>,
    pub pay_roll_bank_card_number: Option<String>,
    pub bank_link_number: Option<String>,
    pub pay_roll_top_bank_code: Option<String>,
    pub has_buy_insurance: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "PascalCase")]
pub struct ProjectWorkerExitRequest {
    pub project_worker_id: String,
    pub exit_time: String,
    pub exit_file: Option<String>,
    pub exit_file_extension: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "PascalCase")]
pub struct AddTeamRequest {
    pub project_apartment_id: i32,
    pub corp_code: String,
    pub project_team_type_name: String,
    pub team_leader_name: String,
    pub team_name: String,
    pub remarks: String,
    pub entry_time: String,
    pub files: Vec<Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "PascalCase")]
pub struct TeamExitRequest {
    pub team_id: i64,
    pub remarks: String,
    pub exit_time: String,
    pub files: Vec<Value>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "PascalCase")]
pub struct PlatformTeam {
    #[serde(alias = "id")]
    pub id: i64,
    #[serde(
        default,
        alias = "enterpriseName",
        deserialize_with = "deserialize_nullable_string"
    )]
    pub enterprise_name: String,
    #[serde(
        default,
        alias = "corpCode",
        deserialize_with = "deserialize_nullable_string"
    )]
    pub corp_code: String,
    #[serde(
        default,
        alias = "projectTeamTypeName",
        deserialize_with = "deserialize_nullable_string"
    )]
    pub project_team_type_name: String,
    #[serde(
        default,
        alias = "teamLeaderName",
        deserialize_with = "deserialize_nullable_string"
    )]
    pub team_leader_name: String,
    #[serde(
        default,
        alias = "teamName",
        deserialize_with = "deserialize_nullable_string"
    )]
    pub team_name: String,
    #[serde(
        default,
        alias = "isExited",
        deserialize_with = "deserialize_nullable_bool"
    )]
    pub is_exited: bool,
}

#[derive(Debug, Clone)]
pub struct PlatformResponse {
    pub status: StatusCode,
    pub body: Value,
}

pub fn build_client() -> Result<Client, NingboHousingError> {
    Client::builder()
        .connect_timeout(Duration::from_secs(3))
        .timeout(Duration::from_secs(15))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|error| NingboHousingError::Request(error.to_string()))
}

pub fn current_cur_time() -> i64 {
    const UNIX_TO_2000_EPOCH_SECONDS: i64 = 946_684_800;
    Utc::now().timestamp() - UNIX_TO_2000_EPOCH_SECONDS
}

pub fn is_valid_social_credit_code(value: &str) -> bool {
    value.len() == 18
        && value
            .bytes()
            .all(|byte| b"0123456789ABCDEFGHJKLMNPQRTUWXY".contains(&byte))
}

pub fn checksum(app_secret: &str, cur_time: i64) -> String {
    let digest = Sha256::digest(format!("{app_secret}{cur_time}").as_bytes());
    hex::encode(digest)
}

pub async fn add_team(
    client: &Client,
    credentials: &NingboHousingCredentials,
    team: &AddTeamRequest,
) -> Result<PlatformResponse, NingboHousingError> {
    send(
        client
            .post(credentials.endpoint("Project/AddTeam")?)
            .json(team),
        credentials,
    )
    .await
}

pub async fn get_worker_code(
    client: &Client,
    credentials: &NingboHousingCredentials,
    identity_card: &str,
) -> Result<PlatformResponse, NingboHousingError> {
    send(
        client
            .get(credentials.endpoint("EnterpriseWorker/GetWorkerCode")?)
            .query(&[
                ("IdentityCard", identity_card),
                ("ProjectGuid", credentials.project_guid.as_str()),
            ]),
        credentials,
    )
    .await
}

pub async fn add_or_update_worker(
    client: &Client,
    credentials: &NingboHousingCredentials,
    request: &AddOrUpdateWorkerRequest,
) -> Result<PlatformResponse, NingboHousingError> {
    send(
        client
            .post(credentials.endpoint("EnterpriseWorker/AddOrUpdateWorker")?)
            .json(request),
        credentials,
    )
    .await
}

pub async fn add_enterprise_worker(
    client: &Client,
    credentials: &NingboHousingCredentials,
    request: &AddEnterpriseWorkerRequest,
) -> Result<PlatformResponse, NingboHousingError> {
    send(
        client
            .post(credentials.endpoint("EnterpriseWorker/AddEnterpriseOfWorker")?)
            .json(request),
        credentials,
    )
    .await
}

pub async fn add_project_worker(
    client: &Client,
    credentials: &NingboHousingCredentials,
    request: &AddProjectWorkerRequest,
) -> Result<PlatformResponse, NingboHousingError> {
    send(
        client
            .post(credentials.endpoint("Project/AddWorkerV2")?)
            .json(request),
        credentials,
    )
    .await
}

pub async fn edit_project_worker(
    client: &Client,
    credentials: &NingboHousingCredentials,
    request: &EditProjectWorkerRequest,
) -> Result<PlatformResponse, NingboHousingError> {
    send(
        client
            .post(credentials.endpoint("Project/EditWorker")?)
            .json(request),
        credentials,
    )
    .await
}

pub async fn exit_project_worker(
    client: &Client,
    credentials: &NingboHousingCredentials,
    request: &ProjectWorkerExitRequest,
) -> Result<PlatformResponse, NingboHousingError> {
    send(
        client
            .post(credentials.endpoint("Project/ProjectWorkerExit")?)
            .json(request),
        credentials,
    )
    .await
}

pub async fn exit_team(
    client: &Client,
    credentials: &NingboHousingCredentials,
    request: &TeamExitRequest,
) -> Result<PlatformResponse, NingboHousingError> {
    send(
        client
            .post(credentials.endpoint("Project/TeamExit")?)
            .json(request),
        credentials,
    )
    .await
}

pub async fn list_teams(
    client: &Client,
    credentials: &NingboHousingCredentials,
    team_name: &str,
) -> Result<Vec<PlatformTeam>, NingboHousingError> {
    let mut teams = Vec::new();
    let mut page = 1_i64;
    loop {
        let response = send(
            client
                .get(credentials.endpoint("Project/ListTeams")?)
                .query(&[
                    ("ProjectApartmentId", credentials.project_id.to_string()),
                    ("TeamName", team_name.to_owned()),
                    ("Page", page.to_string()),
                    ("PageSize", "100".to_owned()),
                ]),
            credentials,
        )
        .await?;
        if !response.status.is_success() {
            return Err(NingboHousingError::Request(response_message(
                &response.body,
            )));
        }

        let page_teams = extract_team_list(&response.body)?;
        let total_count = recursive_i64(&response.body, &["TotalCount", "totalCount"]);
        teams.extend(page_teams);
        if teams.len() as i64 >= total_count.unwrap_or(teams.len() as i64)
            || page >= MAX_TEAM_LIST_PAGES
        {
            break;
        }
        page += 1;
    }
    Ok(teams)
}

pub fn extract_created_team_id(body: &Value) -> Option<i64> {
    recursive_i64(body, &["TeamId", "teamId"])
        .or_else(|| {
            ["Data", "data", "Result", "result"]
                .iter()
                .find_map(|key| body.get(*key).and_then(scalar_i64))
        })
        .or_else(|| body.as_i64())
        .or_else(|| body.as_str().and_then(|value| value.parse().ok()))
}

pub fn extract_worker_code(body: &Value) -> Option<String> {
    recursive_value(body, &["WorkerCode", "workerCode"])
        .and_then(scalar_string)
        .or_else(|| {
            ["Data", "data", "Result", "result"]
                .iter()
                .find_map(|key| body.get(*key).and_then(scalar_string))
        })
        .or_else(|| scalar_string(body))
}

pub fn extract_project_worker_id(body: &Value) -> Option<i64> {
    recursive_i64(body, &["ProjectWorkerId", "projectWorkerId"])
        .or_else(|| {
            ["Data", "data", "Result", "result"]
                .iter()
                .find_map(|key| body.get(*key).and_then(scalar_i64))
        })
        .or_else(|| scalar_i64(body))
}

pub fn response_indicates_team_exists(response: &PlatformResponse) -> bool {
    if response.status.is_success() && extract_created_team_id(&response.body).is_some() {
        return false;
    }
    let message = response_message(&response.body);
    message.contains("班组")
        && (message.contains("已存在")
            || message.contains("已经存在")
            || message.contains("不能重复"))
}

pub fn response_indicates_worker_already_exited(response: &PlatformResponse) -> bool {
    if response.status.is_success() {
        return false;
    }
    let message = response_message(&response.body);
    (message.contains("人员") || message.contains("工人"))
        && (message.contains("已退场")
            || message.contains("已经退场")
            || message.contains("已离场")
            || message.contains("已经离场"))
}

pub fn response_indicates_worker_already_employed(response: &PlatformResponse) -> bool {
    if response.status.is_success() {
        return false;
    }
    let message = response_message(&response.body);
    (message.contains("人员") || message.contains("工人"))
        && (message.contains("已在该企业任职")
            || message.contains("已经在该企业任职")
            || message.contains("已在企业任职")
            || message.contains("已经在企业任职"))
}

pub fn match_existing_team<'a>(
    teams: &'a [PlatformTeam],
    team_name: &str,
    corp_code: &str,
    team_type: &str,
    leader_name: &str,
) -> Option<&'a PlatformTeam> {
    let mut candidates = teams
        .iter()
        .filter(|team| !team.is_exited)
        .filter(|team| normalized_eq(&team.team_name, team_name))
        .filter(|team| normalized_eq(&team.corp_code, corp_code))
        .filter(|team| normalized_eq(&team.project_team_type_name, team_type))
        .collect::<Vec<_>>();
    if candidates.len() == 1 {
        return candidates.pop();
    }
    if candidates.is_empty() {
        return None;
    }

    if leader_name.trim().is_empty() {
        return None;
    }
    let led = candidates
        .into_iter()
        .filter(|team| normalized_eq(&team.team_leader_name, leader_name))
        .collect::<Vec<_>>();
    (led.len() == 1).then(|| led[0])
}

pub fn response_message(body: &Value) -> String {
    for key in ["Message", "message", "Error", "error", "Title", "title"] {
        if let Some(message) = body.get(key).and_then(Value::as_str) {
            return message.to_owned();
        }
    }
    if let Some(data) = body.get("data").or_else(|| body.get("Data")) {
        let nested = response_message(data);
        if !nested.is_empty() {
            return nested;
        }
    }
    body.as_str()
        .map(str::to_owned)
        .unwrap_or_else(|| body.to_string())
}

async fn send(
    request: reqwest::RequestBuilder,
    credentials: &NingboHousingCredentials,
) -> Result<PlatformResponse, NingboHousingError> {
    let cur_time = current_cur_time();
    let mut response = request
        .header("AppKey", &credentials.app_key)
        .header("CurTime", cur_time.to_string())
        .header("Checksum", checksum(&credentials.app_secret, cur_time))
        .send()
        .await
        .map_err(|error| NingboHousingError::Request(error.to_string()))?;
    let status = response.status();
    if response
        .content_length()
        .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
    {
        return Err(NingboHousingError::ResponseTooLarge);
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| NingboHousingError::Request(error.to_string()))?
    {
        if bytes.len().saturating_add(chunk.len()) > MAX_RESPONSE_BYTES {
            return Err(NingboHousingError::ResponseTooLarge);
        }
        bytes.extend_from_slice(&chunk);
    }
    let body = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes)
            .unwrap_or_else(|_| Value::String(String::from_utf8_lossy(&bytes).into_owned()))
    };
    Ok(PlatformResponse { status, body })
}

fn extract_team_list(body: &Value) -> Result<Vec<PlatformTeam>, NingboHousingError> {
    let list = recursive_value(body, &["List", "list"])
        .and_then(Value::as_array)
        .ok_or(NingboHousingError::InvalidResponse)?;
    list.iter()
        .cloned()
        .map(|item| serde_json::from_value(item).map_err(|_| NingboHousingError::InvalidResponse))
        .collect()
}

fn recursive_value<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a Value> {
    for key in keys {
        if let Some(found) = value.get(key) {
            return Some(found);
        }
    }
    for wrapper in ["Data", "data", "Result", "result"] {
        if let Some(nested) = value.get(wrapper)
            && let Some(found) = recursive_value(nested, keys)
        {
            return Some(found);
        }
    }
    None
}

fn recursive_i64(value: &Value, keys: &[&str]) -> Option<i64> {
    recursive_value(value, keys).and_then(scalar_i64)
}

fn scalar_i64(item: &Value) -> Option<i64> {
    item.as_i64()
        .or_else(|| item.as_str().and_then(|raw| raw.parse().ok()))
}

fn scalar_string(item: &Value) -> Option<String> {
    item.as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .or_else(|| item.as_i64().map(|number| number.to_string()))
}

fn validate_base_url(value: &str) -> Result<Url, NingboHousingError> {
    let mut url = Url::parse(value).map_err(|_| NingboHousingError::UntrustedBaseUrl)?;
    if !matches!(url.scheme(), "http" | "https")
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(NingboHousingError::UntrustedBaseUrl);
    }
    let host = url.host_str().ok_or(NingboHousingError::UntrustedBaseUrl)?;
    let mut allowed_hosts = HashSet::from([OFFICIAL_HOST.to_owned()]);
    if let Ok(extra_hosts) = env::var("NINGBO_HOUSING_ALLOWED_HOSTS") {
        allowed_hosts.extend(
            extra_hosts
                .split(',')
                .map(str::trim)
                .filter(|host| !host.is_empty())
                .map(str::to_owned),
        );
    }
    if !allowed_hosts.contains(host) || is_unsafe_ip(host) {
        return Err(NingboHousingError::UntrustedBaseUrl);
    }
    url.set_query(None);
    url.set_fragment(None);
    if !url.path().ends_with('/') {
        url.set_path(&format!("{}/", url.path().trim_end_matches('/')));
    }
    Ok(url)
}

fn is_unsafe_ip(host: &str) -> bool {
    let Ok(ip) = host.parse::<IpAddr>() else {
        return false;
    };
    match ip {
        IpAddr::V4(ip) => {
            ip.is_private()
                || ip.is_loopback()
                || ip.is_link_local()
                || ip.is_broadcast()
                || ip.is_unspecified()
        }
        IpAddr::V6(ip) => ip.is_loopback() || ip.is_unspecified(),
    }
}

fn required_config_string(
    config: &Value,
    keys: &[&str],
    label: &'static str,
) -> Result<String, NingboHousingError> {
    config_string(config, keys).ok_or(NingboHousingError::MissingConfig(label))
}

fn config_string(config: &Value, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        let value = config.get(*key)?;
        value
            .as_str()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_owned)
            .or_else(|| value.as_i64().map(|number| number.to_string()))
    })
}

fn normalized_eq(left: &str, right: &str) -> bool {
    left.trim().eq_ignore_ascii_case(right.trim())
}

fn deserialize_nullable_bool<'de, D>(deserializer: D) -> Result<bool, D::Error>
where
    D: Deserializer<'de>,
{
    Ok(Option::<bool>::deserialize(deserializer)?.unwrap_or(false))
}

fn deserialize_nullable_string<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: Deserializer<'de>,
{
    Ok(Option::<String>::deserialize(deserializer)?.unwrap_or_default())
}

pub fn add_team_request(
    credentials: &NingboHousingCredentials,
    corp_code: String,
    team_type: String,
    team_name: String,
    leader_name: String,
    remark: String,
    entry_time: String,
) -> AddTeamRequest {
    AddTeamRequest {
        project_apartment_id: credentials.project_id,
        corp_code,
        project_team_type_name: team_type,
        team_leader_name: leader_name,
        team_name,
        remarks: remark,
        entry_time,
        files: vec![],
    }
}

pub fn team_exit_request(team_id: i64, team_name: &str, exit_time: String) -> TeamExitRequest {
    TeamExitRequest {
        team_id,
        remarks: format!("山淮系统删除班组：{}", team_name.trim()),
        exit_time,
        files: vec![],
    }
}

pub fn success_payload(team_id: i64, recovered_existing: bool, response: Value) -> Value {
    json!({
        "team_id": team_id,
        "recovered_existing": recovered_existing,
        "platform_response": response,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checksum_matches_document_formula() {
        let expected = hex::encode(Sha256::digest(b"secret123"));
        assert_eq!(checksum("secret", 123), expected);
    }

    #[test]
    fn project_id_must_fit_the_documented_int_type() {
        let config = json!({
            "base_url": DEFAULT_BASE_URL,
            "app_key": "key",
            "app_secret": "secret",
            "project_id": "913302121440896573"
        });
        assert!(matches!(
            NingboHousingCredentials::from_config(&config),
            Err(NingboHousingError::InvalidProjectId)
        ));
    }

    #[test]
    fn validates_unified_social_credit_code_shape() {
        assert!(is_valid_social_credit_code("91330212062914115M"));
        assert!(!is_valid_social_credit_code("91330212062914115M -"));
        assert!(!is_valid_social_credit_code("91330200TEST"));
    }

    #[test]
    fn parses_created_team_id_from_common_wrappers() {
        assert_eq!(extract_created_team_id(&json!({"TeamId": 18})), Some(18));
        assert_eq!(
            extract_created_team_id(&json!({"data": {"TeamId": "19"}})),
            Some(19)
        );
        assert_eq!(extract_created_team_id(&json!({"Data": 20})), Some(20));
    }

    #[test]
    fn parses_worker_ids_from_common_wrappers() {
        assert_eq!(
            extract_worker_code(&json!({"Data": {"WorkerCode": "YJ-100"}})),
            Some("YJ-100".to_owned())
        );
        assert_eq!(
            extract_project_worker_id(&json!({"result": {"ProjectWorkerId": "808"}})),
            Some(808)
        );
    }

    #[test]
    fn project_worker_request_uses_documented_field_names() {
        let request = AddProjectWorkerRequest {
            project_apartment_id: 185157,
            team_id: 3510086,
            worker_code: "YJ-100".to_owned(),
            is_team_leader: false,
            work_type_name: "通风工".to_owned(),
            entry_time: "2026-07-19".to_owned(),
            entry_attach_file: None,
            entry_attach_file_extension: None,
            issue_card_date: None,
            issue_card_pic: None,
            issue_card_pic_extension: None,
            card_number: None,
            pay_roll_bank_card_number: None,
            bank_link_number: None,
            pay_roll_top_bank_code: None,
            has_buy_insurance: false,
        };
        let value = serde_json::to_value(request).expect("serialize AddWorkerV2 request");
        assert_eq!(value["ProjectApartmentId"], 185157);
        assert_eq!(value["TeamId"], 3510086);
        assert_eq!(value["WorkerCode"], "YJ-100");
        assert_eq!(value["WorkTypeName"], "通风工");
        assert_eq!(value["EntryTime"], "2026-07-19");
    }

    #[test]
    fn edit_and_exit_requests_use_project_worker_id() {
        let edit = EditProjectWorkerRequest {
            project_apartment_id: 185157,
            project_worker_id: 808,
            is_team_leader: false,
            work_type_name: "通风工".to_owned(),
            entry_time: "2026-07-19".to_owned(),
            entry_attach_file: None,
            entry_attach_file_extension: None,
            issue_card_date: None,
            issue_card_pic: None,
            issue_card_pic_extension: None,
            card_number: None,
            pay_roll_bank_card_number: None,
            bank_link_number: None,
            pay_roll_top_bank_code: None,
            has_buy_insurance: false,
        };
        let exit = ProjectWorkerExitRequest {
            project_worker_id: "808".to_owned(),
            exit_time: "2026-07-20".to_owned(),
            exit_file: None,
            exit_file_extension: None,
        };

        let edit_value = serde_json::to_value(edit).expect("serialize EditWorker request");
        let exit_value = serde_json::to_value(exit).expect("serialize ProjectWorkerExit request");
        assert_eq!(edit_value["ProjectWorkerId"], 808);
        assert_eq!(exit_value["ProjectWorkerId"], "808");
        assert_eq!(exit_value["ExitTime"], "2026-07-20");
    }

    #[test]
    fn team_exit_request_uses_the_documented_pascal_case_fields() {
        let value =
            serde_json::to_value(team_exit_request(3510086, "石工", "2026-07-18".to_owned()))
                .expect("serialize TeamExit request");
        assert_eq!(
            value,
            json!({
                "TeamId": 3510086,
                "Remarks": "山淮系统删除班组：石工",
                "ExitTime": "2026-07-18",
                "Files": []
            })
        );
    }

    #[test]
    fn existing_team_match_requires_name_and_corp_code() {
        let teams = vec![
            PlatformTeam {
                id: 10,
                enterprise_name: "甲公司".to_owned(),
                corp_code: "91330000ABC".to_owned(),
                project_team_type_name: "钢筋工".to_owned(),
                team_leader_name: "张三".to_owned(),
                team_name: "钢筋一班".to_owned(),
                is_exited: false,
            },
            PlatformTeam {
                id: 11,
                enterprise_name: "乙公司".to_owned(),
                corp_code: "91330000XYZ".to_owned(),
                project_team_type_name: "钢筋工".to_owned(),
                team_leader_name: "张三".to_owned(),
                team_name: "钢筋一班".to_owned(),
                is_exited: false,
            },
        ];
        assert_eq!(
            match_existing_team(&teams, "钢筋一班", "91330000ABC", "钢筋工", "张三")
                .map(|team| team.id),
            Some(10)
        );
        assert!(match_existing_team(&teams, "钢筋一班", "not-matched", "钢筋工", "张三").is_none());
        assert!(match_existing_team(&teams, "钢筋一班", "91330000ABC", "木工", "张三").is_none());
        assert_eq!(
            match_existing_team(&teams, "钢筋一班", "91330000ABC", "钢筋工", "")
                .map(|team| team.id),
            Some(10)
        );
    }

    #[test]
    fn detects_team_already_exists_message() {
        let response = PlatformResponse {
            status: StatusCode::BAD_REQUEST,
            body: json!({"Message": "班组已存在"}),
        };
        assert!(response_indicates_team_exists(&response));
        let duplicate_name_response = PlatformResponse {
            status: StatusCode::BAD_REQUEST,
            body: json!({"Message": "班组录入验证不通过：同一个项目上的班组名称不能重复:石工"}),
        };
        assert!(response_indicates_team_exists(&duplicate_name_response));
    }

    #[test]
    fn detects_worker_already_exited_message() {
        let response = PlatformResponse {
            status: StatusCode::BAD_REQUEST,
            body: json!({"Message": "项目人员已退场，不能重复退场"}),
        };
        assert!(response_indicates_worker_already_exited(&response));
    }

    #[test]
    fn detects_worker_already_employed_message() {
        let response = PlatformResponse {
            status: StatusCode::BAD_REQUEST,
            body: json!({"Message": "人员已在该企业任职"}),
        };
        assert!(response_indicates_worker_already_employed(&response));
    }

    #[test]
    fn parses_nullable_is_exited_from_list_teams() {
        let teams = extract_team_list(&json!({
            "TotalCount": 1,
            "List": [{
                "Id": 3510086,
                "CorpCode": "91330200254083803J",
                "ProjectTeamTypeName": "石工",
                "TeamName": "石工",
                "TeamLeaderName": null,
                "IsExited": null
            }]
        }))
        .expect("nullable platform fields should parse");
        assert_eq!(teams.len(), 1);
        assert_eq!(teams[0].team_leader_name, "");
        assert!(!teams[0].is_exited);
    }

    #[test]
    fn leader_is_only_used_to_disambiguate_duplicate_strict_matches() {
        let teams = vec![
            PlatformTeam {
                id: 21,
                enterprise_name: "甲公司".to_owned(),
                corp_code: "91330000ABC".to_owned(),
                project_team_type_name: "钢筋工".to_owned(),
                team_leader_name: "张三".to_owned(),
                team_name: "钢筋一班".to_owned(),
                is_exited: false,
            },
            PlatformTeam {
                id: 22,
                enterprise_name: "甲公司".to_owned(),
                corp_code: "91330000ABC".to_owned(),
                project_team_type_name: "钢筋工".to_owned(),
                team_leader_name: "李四".to_owned(),
                team_name: "钢筋一班".to_owned(),
                is_exited: false,
            },
        ];

        assert!(match_existing_team(&teams, "钢筋一班", "91330000ABC", "钢筋工", "").is_none());
        assert_eq!(
            match_existing_team(&teams, "钢筋一班", "91330000ABC", "钢筋工", "李四")
                .map(|team| team.id),
            Some(22)
        );
    }
}

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPlatformAttemptCurl,
  platformLogAttempts,
  platformLogBaseUrl,
} from "./platform-log-http.ts";

test("platform log attempts are normalized newest attempt first", () => {
  const payload = {
    base_url: "https://apirs.91jtg.com/openapi",
    attempts: [
      { attempt_no: 1, method: "POST", url: "projectCorp/v2/add", request: { corpName: "甲" } },
      { attempt_no: 2, method: "POST", url: "projectCorp/v2/add", request: { corpName: "乙" } },
    ],
  };

  assert.equal(platformLogBaseUrl(payload), "https://apirs.91jtg.com/openapi");
  assert.deepEqual(platformLogAttempts(payload).map((attempt) => attempt.attempt_no), [2, 1]);
});

test("platform attempt curl contains full URL headers and JSON body", () => {
  const [attempt] = platformLogAttempts({
    attempts: [{
      attempt_no: 1,
      method: "POST",
      url: "projectCorp/v2/add",
      headers: { projectCode: "project-001", appKey: "app-key-001", sign: "actual-sign" },
      request: { corpName: "汇绿园林建设发展有限公司", note: "O'Reilly" },
    }],
  });

  const curl = buildPlatformAttemptCurl(attempt!, "https://apirs.91jtg.com/openapi/");
  assert.match(curl, /https:\/\/apirs\.91jtg\.com\/openapi\/projectCorp\/v2\/add/);
  assert.match(curl, /projectCode: project-001/);
  assert.match(curl, /appKey: app-key-001/);
  assert.match(curl, /sign: actual-sign/);
  assert.match(curl, /Content-Type: application\/json/);
  assert.match(curl, /汇绿园林建设发展有限公司/);
  assert.match(curl, /O'"'"'Reilly/);
});

test("GET attempt curl puts logged request fields in the query string", () => {
  const [attempt] = platformLogAttempts({
    attempts: [{
      attempt_no: 1,
      method: "GET",
      url: "http://example.test/EnterpriseWorker/GetWorkerCode",
      request: { IdentityCard: "[REDACTED]", ProjectGuid: "project-guid" },
    }],
  });

  const curl = buildPlatformAttemptCurl(attempt!);
  assert.match(curl, /IdentityCard=%5BREDACTED%5D&ProjectGuid=project-guid/);
  assert.doesNotMatch(curl, /--data-raw/);
  assert.doesNotMatch(curl, /Content-Type/);
});

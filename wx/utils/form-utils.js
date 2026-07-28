const { resolveAssetUrl } = require("../config/api.js");
const { uploadConstructionFile } = require("./construction-api.js");
const { provinces, nativePlaceParts } = require("./china-regions.js");

function buildDefaultForm(fields, record = {}, overrides = {}) {
  return fields.reduce((form, field) => {
    form[field.key] = stringifyFormValue(field, overrides[field.key] !== undefined ? overrides[field.key] : record[field.key]);
    if (!form[field.key] && field.defaultValue !== undefined) {
      form[field.key] = field.defaultValue;
    }
    return form;
  }, {});
}

function buildFormFields(fields, form, lookups = {}) {
  return fields
    .filter((field) => !field.hidden && isFieldVisible(field, form))
    .map((field) => {
      const options = resolveOptions(field, form, lookups);
      const value = form[field.key] || "";
      const optionIndex = options.length ? Math.max(0, options.findIndex((item) => item.value === value)) : 0;
      const selectedOption = options.find((item) => item.value === value);
      const valueLabel = selectedOption ? selectedOption.label : "";
      return {
        ...field,
        options,
        value,
        optionIndex,
        valueLabel,
        displayValue: valueLabel || (field.control === "select" ? "请选择" : ""),
        dateDisplay: value || "请选择日期",
        uploadDisplay: uploadDisplayValue(field, value),
        uploadActionText: field.uploadKind === "image" ? "上传图片" : "选择本地文件",
        uploadItems: uploadPreviewItems(field, value),
        placeholder: field.placeholder || "请输入",
        inputType: field.valueType === "number" ? "number" : "text",
        ...(field.control === "nativePlace" ? buildNativePlaceField(value) : null),
      };
    });
}

// 籍贯省/市两级 picker 渲染数据；存储值为 6 位区划码
function buildNativePlaceField(value) {
  const { province, city } = nativePlaceParts(value);
  const cities = province ? province.cities : [];
  return {
    nativeProvinceNames: provinces.map((item) => item.name),
    nativeProvinceIndex: province ? provinces.indexOf(province) : 0,
    nativeProvinceLabel: province ? province.name : "",
    nativeCityNames: cities.map((item) => item.name),
    nativeCityIndex: city ? cities.indexOf(city) : 0,
    nativeCityLabel: city ? city.name : "",
  };
}

function resolveOptions(field, form, lookups) {
  if (field.options) {
    // 与 Web 端一致：管理班组时工种只能选项目管理部（1001），否则排除它
    if (field.managementTeamType) {
      return field.options.filter((option) =>
        String(form.is_manage_team || "") === "true" ? option.value === "1001" : option.value !== "1001"
      );
    }
    return field.options;
  }
  if (field.optionsSource === "units") {
    return [{ label: "请选择参建单位", value: "" }].concat((lookups.units || []).map((unit) => ({
      label: unit.company_name || "未命名单位",
      value: unit.id,
    })));
  }
  if (field.optionsSource === "teams") {
    const teams = (lookups.teams || []).filter((team) => !form.unit_id || team.unit_id === form.unit_id);
    return [{ label: "请选择班组", value: "" }].concat(teams.map((team) => ({
      label: team.name || "未命名班组",
      value: team.id,
    })));
  }
  if (field.optionsSource === "workers") {
    return [{ label: "请选择工人", value: "" }].concat((lookups.workers || []).map((worker) => ({
      label: [worker.name || "未命名工人", worker.phone].filter(Boolean).join(" / "),
      value: worker.id,
    })));
  }
  return [];
}

function buildPayloadFromForm(fields, form) {
  return fields.reduce((payload, field) => {
    if (!isFieldVisible(field, form)) return payload;
    const rawValue = form[field.key];
    const textValue = rawValue === undefined || rawValue === null ? "" : String(rawValue).trim();

    if (field.required && !textValue) {
      throw new Error(`请填写${field.label}`);
    }

    if (!textValue) {
      payload[field.key] = null;
      return payload;
    }

    if (field.valueType === "boolean") {
      payload[field.key] = rawValue === true || rawValue === "true";
      return payload;
    }

    if (field.valueType === "number") {
      const numberValue = Number(textValue);
      if (!Number.isFinite(numberValue)) {
        throw new Error(`${field.label}必须是数字`);
      }
      payload[field.key] = numberValue;
      return payload;
    }

    if (field.valueType === "json") {
      try {
        payload[field.key] = typeof rawValue === "string" ? JSON.parse(rawValue) : rawValue;
      } catch (error) {
        throw new Error(`${field.label}必须是有效文件数据`);
      }
      return payload;
    }

    if (field.valueType === "datetime") {
      const normalized = textValue.includes("T") ? textValue : textValue.replace(" ", "T");
      const date = new Date(normalized);
      if (Number.isNaN(date.getTime())) {
        throw new Error(`${field.label}时间格式无效`);
      }
      payload[field.key] = date.toISOString();
      return payload;
    }

    if (field.valueType === "date") {
      const date = new Date(`${textValue}T00:00:00`);
      if (Number.isNaN(date.getTime())) {
        throw new Error(`${field.label}日期格式无效`);
      }
    }

    payload[field.key] = textValue;
    return payload;
  }, {});
}

function isFieldVisible(field, form) {
  return !field.visibleWhenWorkerType || String(form.worker_type || "") === field.visibleWhenWorkerType;
}

function stringifyFormValue(field, value) {
  if (value === undefined || value === null) return "";
  if (field.valueType === "json") return JSON.stringify(value);
  if (field.valueType === "datetime" && typeof value === "string") return toDatetimeLocal(value);
  if (field.valueType === "date" && typeof value === "string") return value.slice(0, 10);
  return String(value);
}

function toDatetimeLocal(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16).replace("T", " ");
}

function today() {
  const date = new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function optionLabel(fields, key, value, fallback = "未填写") {
  const field = fields.find((item) => item.key === key);
  const option = ((field && field.options) || []).find((item) => item.value === String(value));
  return option ? option.label : value || fallback;
}

function pickUploadFile(field) {
  return new Promise((resolve, reject) => {
    const done = (filePath) => {
      if (filePath) resolve(filePath);
      else reject(new Error("未选择文件"));
    };

    if (field.uploadKind === "image") {
      if (wx.chooseMedia) {
        wx.chooseMedia({
          count: 1,
          mediaType: ["image"],
          sourceType: ["album", "camera"],
          success: (res) => done(res.tempFiles && res.tempFiles[0] && res.tempFiles[0].tempFilePath),
          fail: reject,
        });
        return;
      }
      wx.chooseImage({
        count: 1,
        sourceType: ["album", "camera"],
        success: (res) => done(res.tempFilePaths && res.tempFilePaths[0]),
        fail: reject,
      });
      return;
    }

    if (wx.chooseMessageFile) {
      wx.chooseMessageFile({
        count: 1,
        type: "all",
        success: (res) => done(res.tempFiles && res.tempFiles[0] && res.tempFiles[0].path),
        fail: reject,
      });
      return;
    }

    wx.chooseImage({
      count: 1,
      sourceType: ["album"],
      success: (res) => done(res.tempFilePaths && res.tempFilePaths[0]),
      fail: reject,
    });
  });
}

async function uploadForField(field, context = {}) {
  const filePath = await pickUploadFile(field);
  const file = await uploadConstructionFile(filePath, {
    bizType: context.bizType,
    bizId: context.bizId,
    fieldKey: field.key,
  });
  // 额外返回本地临时路径，供 OCR 等场景读 base64 使用
  return { file, filePath };
}

// 读取本地临时文件的 base64；失败时返回空字符串，由调用方回退到 URL 方式
function readFileBase64(filePath) {
  if (!filePath) return "";
  try {
    return wx.getFileSystemManager().readFileSync(filePath, "base64") || "";
  } catch (error) {
    return "";
  }
}

function nextUploadValue(field, currentValue, file) {
  if (field.valueType === "json" || field.uploadMultiple) {
    let files = [];
    try {
      files = currentValue ? JSON.parse(currentValue) : [];
    } catch (error) {
      files = [];
    }
    files.push(file);
    return JSON.stringify(files);
  }

  return file.public_url || file.object_key || "";
}

function uploadDisplayValue(field, value) {
  if (!value) return "未上传";
  if (field.valueType !== "json") return "已上传";
  try {
    const files = JSON.parse(value);
    return Array.isArray(files) && files.length ? `${files.length} 个文件` : "未上传";
  } catch (error) {
    return "已上传";
  }
}

function uploadPreviewItems(field, value) {
  if (!value) return [];
  return parseUploadItems(field, value).map((file, index) => {
    const url = resolveAssetUrl(typeof file === "string" ? file : file.public_url || file.url || "");
    const name = typeof file === "string"
      ? (url ? url.split("/").pop() : "") || `${field.label || "文件"}${index + 1}`
      : file.original_filename || file.name || file.object_key || (url ? url.split("/").pop() : "") || `${field.label || "文件"}${index + 1}`;
    return {
      name,
      url,
      isImage: isImageUpload(field, file, url),
    };
  }).filter((file) => file.url);
}

function parseUploadItems(field, value) {
  if (field.valueType !== "json") {
    return [{ public_url: value }];
  }
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
    return parsed ? [parsed] : [];
  } catch (error) {
    return value ? [{ public_url: value }] : [];
  }
}

function isImageUpload(field, file, url) {
  const contentType = typeof file === "string" ? "" : String(file.content_type || file.mime_type || "");
  if (contentType.startsWith("image/")) return true;
  if (field.uploadKind === "image") return true;
  return /\.(png|jpe?g|gif|webp|bmp|heic|heif)(\?.*)?$/i.test(url);
}

function previewUploadedFile(file) {
  const url = file && file.url;
  if (!url) {
    wx.showToast({ title: "暂无可查看文件", icon: "none" });
    return;
  }
  if (file.isImage) {
    wx.previewImage({ current: url, urls: [url] });
    return;
  }
  wx.showLoading({ title: "打开中" });
  wx.downloadFile({
    url,
    success: (res) => {
      wx.hideLoading();
      if (res.statusCode < 200 || res.statusCode >= 300 || !res.tempFilePath) {
        copyFileLink(url);
        return;
      }
      wx.openDocument({
        filePath: res.tempFilePath,
        showMenu: true,
        fail: () => copyFileLink(url),
      });
    },
    fail: () => {
      wx.hideLoading();
      copyFileLink(url);
    },
  });
}

function copyFileLink(url) {
  wx.setClipboardData({
    data: url,
    success: () => wx.showToast({ title: "文件链接已复制", icon: "none" }),
    fail: () => wx.showToast({ title: "文件暂不可预览", icon: "none" }),
  });
}

module.exports = {
  buildDefaultForm,
  buildFormFields,
  buildPayloadFromForm,
  nextUploadValue,
  optionLabel,
  previewUploadedFile,
  readFileBase64,
  today,
  uploadDisplayValue,
  uploadForField,
  uploadPreviewItems,
};

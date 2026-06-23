import { FileText, ImageIcon, Loader2, Upload, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  getFieldsBySection,
  type ConstructionFormField,
  type ConstructionFormOption,
  type ConstructionFormState,
} from "../data/construction-form-fields";
import { constructionProjectService } from "../services/construction-project-service";
import type { IdCardOcrSide, UploadFileRecord } from "../types/construction-types";
import addressData from "../data/china-address.json";

type OptionSources = Partial<
  Record<NonNullable<ConstructionFormField["optionsSource"]>, ConstructionFormOption[]>
>;

type UploadContext = {
  bizType: string;
  bizId?: string;
};

type RegionNode = {
  code: string;
  name: string;
  children?: RegionNode[];
};

const regions = addressData as RegionNode[];

export function ConstructionRecordForm({
  fields,
  state,
  onChange,
  onBulkChange,
  optionSources,
  uploadContext,
  maxHeightClassName = "max-h-[64vh]",
}: {
  fields: ConstructionFormField[];
  state: ConstructionFormState;
  onChange: (key: string, value: string) => void;
  onBulkChange?: (values: Record<string, string>) => void;
  optionSources?: OptionSources;
  uploadContext?: UploadContext;
  maxHeightClassName?: string;
}) {
  const sections = getFieldsBySection(fields);

  return (
    <div className={cn("space-y-5 overflow-y-auto px-1 py-1", maxHeightClassName)}>
      {sections.map((section) => (
        <section key={section.section} className="space-y-3">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2 dark:border-border">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground">{section.section}</h3>
            <span className="text-xs text-slate-400 dark:text-muted-foreground">{section.fields.length} 项</span>
          </div>
          <div className="grid gap-x-4 gap-y-4 md:grid-cols-2">
            {section.fields.map((field) => (
              <RecordFormField
                key={field.key}
                field={field}
                value={state[field.key] ?? ""}
                state={state}
                onChange={(value) => onChange(field.key, value)}
                onBulkChange={onBulkChange}
                options={field.optionsSource ? optionSources?.[field.optionsSource] : field.options}
                uploadContext={uploadContext}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function RecordFormField({
  field,
  value,
  state,
  onChange,
  onBulkChange,
  options,
  uploadContext,
}: {
  field: ConstructionFormField;
  value: string;
  state: ConstructionFormState;
  onChange: (value: string) => void;
  onBulkChange?: (values: Record<string, string>) => void;
  options?: ConstructionFormOption[];
  uploadContext?: UploadContext;
}) {
  const inputType = field.valueType === "number" ? "number" : field.valueType === "date" ? "date" : field.valueType === "datetime" ? "datetime-local" : "text";
  const fieldOptions = options ?? field.options ?? [];

  return (
    <label className={cn("block min-w-0 space-y-2 text-sm", field.wide && "md:col-span-2")}>
      <span className="block text-xs font-medium leading-none text-slate-500 dark:text-muted-foreground">
        {field.label}
        {field.required ? <span className="ml-0.5 text-red-500">*</span> : null}
      </span>
      {field.control === "region" ? (
        <RegionField value={value} state={state} onChange={onChange} onBulkChange={onBulkChange} />
      ) : field.control === "upload" ? (
        <UploadField field={field} value={value} onChange={onChange} onBulkChange={onBulkChange} uploadContext={uploadContext} />
      ) : field.control === "select" ? (
        <select
          value={value}
          required={field.required}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#0f6b5d] focus:ring-2 focus:ring-[#0f6b5d]/15 dark:border-border dark:bg-background"
        >
          <option value="">请选择</option>
          {fieldOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : field.control === "textarea" ? (
        <textarea
          value={value}
          required={field.required}
          rows={field.valueType === "json" ? 5 : 3}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
          className="w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0f6b5d] focus:ring-2 focus:ring-[#0f6b5d]/15 dark:border-border dark:bg-background"
        />
      ) : (
        <Input
          type={inputType}
          value={value}
          required={field.required}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
          className="h-9"
        />
      )}
    </label>
  );
}

function RegionField({
  value,
  state,
  onChange,
  onBulkChange,
}: {
  value: string;
  state: ConstructionFormState;
  onChange: (value: string) => void;
  onBulkChange?: (values: Record<string, string>) => void;
}) {
  const path = useMemo(
    () => findRegionPath(value, state.address_code_list, state.street),
    [state.address_code_list, state.street, value]
  );
  const province = path[0];
  const city = path[1];
  const district = path[2];
  const street = path[3];
  const cities = province?.children ?? [];
  const districts = city?.children ?? [];
  const streets = district?.children ?? [];

  const applyRegion = (nextPath: RegionNode[]) => {
    const names = nextPath.slice(0, 3).map((node) => node.name);
    const nextDistrict = nextPath[2];
    const nextStreet = nextPath[3];
    onChange(nextDistrict?.code ?? nextPath.at(-1)?.code ?? "");
    onBulkChange?.({
      address_code: nextDistrict?.code ?? nextPath.at(-1)?.code ?? "",
      address_code_list: names.join("/"),
      street: nextStreet?.name ?? "",
    });
  };

  const selectProvince = (code: string) => {
    const nextProvince = regions.find((item) => item.code === code);
    applyRegion(nextProvince ? [nextProvince] : []);
  };

  const selectCity = (code: string) => {
    const nextCity = cities.find((item) => item.code === code);
    applyRegion(province && nextCity ? [province, nextCity] : province ? [province] : []);
  };

  const selectDistrict = (code: string) => {
    const nextDistrict = districts.find((item) => item.code === code);
    applyRegion(province && city && nextDistrict ? [province, city, nextDistrict] : [province, city].filter(Boolean) as RegionNode[]);
  };

  const selectStreet = (code: string) => {
    const nextStreet = streets.find((item) => item.code === code);
    applyRegion(
      province && city && district && nextStreet
        ? [province, city, district, nextStreet]
        : [province, city, district].filter(Boolean) as RegionNode[]
    );
  };

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3 dark:border-border dark:bg-background">
      <div className="grid gap-2 md:grid-cols-4">
        <RegionSelect
          label="省"
          value={province?.code ?? ""}
          placeholder="选择省"
          options={regions}
          onChange={selectProvince}
        />
        <RegionSelect
          label="市"
          value={city?.code ?? ""}
          placeholder="选择市"
          options={cities}
          disabled={!province}
          onChange={selectCity}
        />
        <RegionSelect
          label="区县"
          value={district?.code ?? ""}
          placeholder="选择区县"
          options={districts}
          disabled={!city}
          onChange={selectDistrict}
        />
        <RegionSelect
          label="街道"
          value={street?.code ?? ""}
          placeholder="选择街道"
          options={streets}
          disabled={!district}
          onChange={selectStreet}
        />
      </div>
      {state.address_code_list ? (
        <div className="mt-2 min-h-4 text-xs text-slate-500 dark:text-muted-foreground">
          {`${state.address_code_list}${state.street ? ` / ${state.street}` : ""}`}
        </div>
      ) : null}
    </div>
  );
}

function RegionSelect({
  label,
  value,
  placeholder,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  options: RegionNode[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="block text-xs font-medium text-slate-500 dark:text-muted-foreground">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm outline-none focus:border-[#0f6b5d] focus:ring-2 focus:ring-[#0f6b5d]/15 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 dark:border-border dark:bg-background dark:disabled:bg-muted"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.code} value={option.code}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function findRegionPath(
  districtCode: string,
  addressNamePath?: string,
  streetName?: string
): RegionNode[] {
  if (districtCode) {
    const found = findRegionPathByCode(regions, districtCode);
    if (found) {
      const district = found[2] ?? found.at(-1);
      const street = streetName && district?.children?.find((item) => item.name === streetName);
      return street ? [...found.slice(0, 3), street] : found;
    }
  }

  const names = addressNamePath?.split("/").filter(Boolean) ?? [];
  if (names.length === 0) return [];

  const province = regions.find((item) => item.name === names[0]);
  const city = province?.children?.find((item) => item.name === names[1]);
  const district = city?.children?.find((item) => item.name === names[2]);
  const street = streetName && district?.children?.find((item) => item.name === streetName);
  return [province, city, district, street].filter(Boolean) as RegionNode[];
}

function findRegionPathByCode(nodes: RegionNode[], code: string, path: RegionNode[] = []): RegionNode[] | null {
  for (const node of nodes) {
    const nextPath = [...path, node];
    if (node.code === code) return nextPath;
    if (node.children) {
      const found = findRegionPathByCode(node.children, code, nextPath);
      if (found) return found;
    }
  }
  return null;
}

function UploadField({
  field,
  value,
  onChange,
  onBulkChange,
  uploadContext,
}: {
  field: ConstructionFormField;
  value: string;
  onChange: (value: string) => void;
  onBulkChange?: (values: Record<string, string>) => void;
  uploadContext?: UploadContext;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [base64ByUrl, setBase64ByUrl] = useState<Record<string, string>>({});
  const isJsonField = field.valueType === "json";
  const items = isJsonField ? parseUploadRecords(value) : value ? [urlToUploadRecord(value)] : [];
  const accept = field.uploadKind === "image" ? "image/*" : undefined;
  const idCardSide = sideForIdCardField(field.key);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;

    setIsUploading(true);
    setError(null);
    setNotice(null);

    try {
      const selectedFiles = Array.from(files);
      const uploaded: UploadFileRecord[] = [];
      const uploadedBase64: Record<string, string> = {};
      for (const file of selectedFiles) {
        const imageBase64 = field.uploadKind === "image" ? await fileToBase64Payload(file) : null;
        const record = await constructionProjectService.uploadFile(file, {
          bizType: uploadContext?.bizType,
          bizId: uploadContext?.bizId,
          fieldKey: field.key,
        });
        uploaded.push(record);
        if (imageBase64) uploadedBase64[record.public_url] = imageBase64;
        if (!field.uploadMultiple) break;
      }
      if (Object.keys(uploadedBase64).length > 0) {
        setBase64ByUrl((current) => ({ ...current, ...uploadedBase64 }));
      }

      if (isJsonField) {
        const nextItems = field.uploadMultiple ? [...items, ...uploaded] : uploaded;
        onChange(JSON.stringify(nextItems.map(toUploadValue), null, 2));
      } else {
        onChange(uploaded[0]?.public_url ?? "");
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "上传失败");
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const removeItem = (index: number) => {
    if (isJsonField) {
      const nextItems = items.filter((_, currentIndex) => currentIndex !== index);
      onChange(nextItems.length > 0 ? JSON.stringify(nextItems.map(toUploadValue), null, 2) : "");
      return;
    }
    onChange("");
  };

  const recognizeIdCard = async () => {
    const imageUrl = items[0]?.public_url;
    if (!idCardSide || !imageUrl) return;

    setIsRecognizing(true);
    setError(null);
    setNotice(null);

    try {
      const result = await constructionProjectService.recognizeIdCard({
        side: idCardSide,
        imageUrl: base64ByUrl[imageUrl] ? undefined : imageUrl,
        imageBase64: base64ByUrl[imageUrl],
      });
      const entries = Object.entries(result.fields ?? {}).filter(([, value]) => value != null && value !== "");
      if (entries.length === 0) {
        setNotice("识别完成，未返回可回填字段");
        return;
      }
      onBulkChange?.(Object.fromEntries(entries));
      setNotice(`已回填 ${entries.length} 项`);
    } catch (recognizeError) {
      setError(recognizeError instanceof Error ? recognizeError.message : "身份证识别失败");
    } finally {
      setIsRecognizing(false);
    }
  };

  return (
    <div className="rounded-md border border-slate-200 bg-white p-2 dark:border-border dark:bg-background">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={field.uploadMultiple}
        className="hidden"
        onChange={(event) => void handleFiles(event.target.files)}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-2 border-slate-200 bg-white dark:border-border dark:bg-background"
          disabled={isUploading}
          onClick={() => inputRef.current?.click()}
        >
          {isUploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {isUploading ? "上传中" : field.uploadKind === "image" ? "上传图片" : "上传文件"}
        </Button>
        {items.length > 0 && (
          <span className="text-xs text-slate-500 dark:text-muted-foreground">
            已上传 {items.length} 个
          </span>
        )}
        {idCardSide && items[0]?.public_url && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-2 border-[#0f6b5d]/30 bg-white text-[#0f6b5d] hover:bg-[#0f6b5d]/10 dark:border-[#0f6b5d]/50 dark:bg-background"
            disabled={isRecognizing}
            onClick={() => void recognizeIdCard()}
          >
            {isRecognizing ? <Loader2 className="size-4 animate-spin" /> : <ImageIcon className="size-4" />}
            {isRecognizing ? "识别中" : idCardSide === "front" ? "识别正面" : "识别背面"}
          </Button>
        )}
      </div>

      {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
      {notice && <div className="mt-2 text-xs text-[#0f6b5d]">{notice}</div>}

      {items.length > 0 && (
        <div className="mt-2 grid gap-2">
          {items.map((item, index) => (
            <div key={`${item.public_url}-${index}`} className="flex items-center gap-2 rounded-md bg-slate-50 p-2 dark:bg-muted/40">
              {field.uploadKind === "image" ? (
                item.public_url ? (
                  <img src={item.public_url} alt={item.original_filename ?? field.label} className="size-10 rounded object-cover" />
                ) : (
                  <ImageIcon className="size-5 text-slate-400" />
                )
              ) : (
                <FileText className="size-5 text-slate-400" />
              )}
              <a
                href={item.public_url}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate text-xs text-slate-700 hover:text-[#0f6b5d] dark:text-muted-foreground"
              >
                {item.original_filename ?? item.public_url}
              </a>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 text-slate-500 hover:bg-red-50 hover:text-red-600"
                onClick={() => removeItem(index)}
                aria-label="移除文件"
              >
                <X className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function sideForIdCardField(fieldKey: string): IdCardOcrSide | null {
  if (fieldKey === "ocr_photo") return "front";
  if (fieldKey === "id_card_back_file") return "back";
  return null;
}

function fileToBase64Payload(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === "string" ? reader.result : "";
      resolve(value.includes(",") ? value.split(",")[1] : value);
    };
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });
}

function parseUploadRecords(value: string): UploadFileRecord[] {
  if (!value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) return parsed.map(normalizeUploadRecord).filter(Boolean) as UploadFileRecord[];
    const record = normalizeUploadRecord(parsed);
    return record ? [record] : [];
  } catch {
    return [];
  }
}

function normalizeUploadRecord(value: unknown): UploadFileRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<UploadFileRecord>;
  if (!record.public_url) return null;
  return {
    id: record.id ?? record.public_url,
    biz_type: record.biz_type ?? null,
    biz_id: record.biz_id ?? null,
    field_key: record.field_key ?? null,
    original_filename: record.original_filename ?? null,
    object_key: record.object_key ?? "",
    bucket: record.bucket ?? null,
    endpoint: record.endpoint ?? null,
    public_base_url: record.public_base_url ?? "",
    public_url: record.public_url,
    storage_driver: record.storage_driver ?? "",
    content_type: record.content_type ?? null,
    size_bytes: record.size_bytes ?? 0,
    uploaded_by: record.uploaded_by ?? null,
    created_at: record.created_at ?? "",
  };
}

function urlToUploadRecord(url: string): UploadFileRecord {
  return {
    id: url,
    biz_type: null,
    biz_id: null,
    field_key: null,
    original_filename: url.split("/").pop() ?? url,
    object_key: "",
    bucket: null,
    endpoint: null,
    public_base_url: "",
    public_url: url,
    storage_driver: "",
    content_type: null,
    size_bytes: 0,
    uploaded_by: null,
    created_at: "",
  };
}

function toUploadValue(record: UploadFileRecord) {
  return {
    id: record.id,
    original_filename: record.original_filename,
    object_key: record.object_key,
    public_base_url: record.public_base_url,
    public_url: record.public_url,
    content_type: record.content_type,
    size_bytes: record.size_bytes,
    storage_driver: record.storage_driver,
    bucket: record.bucket,
    endpoint: record.endpoint,
  };
}

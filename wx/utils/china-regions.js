// 籍贯（省市两级）相关工具：基于全国行政区划数据，存储值为 6 位区划码（市级如 330100，省级如 330000）
const provinces = require("./china-regions-data.js");

function nativePlaceParts(value) {
  const code = String(value === null || value === undefined ? "" : value).trim();
  if (!/^\d{6}$/.test(code)) return { province: null, city: null };
  const province = provinces.find((item) => item.code === code.slice(0, 2)) || null;
  const city = province
    ? province.cities.find((item) => item.code === code.slice(0, 4)) || null
    : null;
  return { province, city };
}

function nativePlaceLabel(value, fallback = "") {
  const { province, city } = nativePlaceParts(value);
  if (!province) return fallback;
  // 直辖市的市级节点是"市辖区"，展示时只保留省级名称
  if (!city || city.name === "市辖区") return province.name;
  return `${province.name}${city.name}`;
}

// 优先用身份证号前 6 位（户籍地区划码）推断籍贯，识别不到再回退地址文本匹配
function inferNativePlace({ idCard, address } = {}) {
  const idPrefix = String(idCard || "").trim().slice(0, 6);
  if (/^\d{6}$/.test(idPrefix)) {
    const { province, city } = nativePlaceParts(idPrefix);
    if (city) return `${city.code}00`;
    if (province) return `${province.code}0000`;
  }
  return inferNativePlaceFromAddress(address);
}

function inferNativePlaceFromAddress(address) {
  const text = String(address || "").trim();
  if (!text) return null;

  let matchedCity = null;
  for (const province of provinces) {
    for (const city of province.cities) {
      if (city.name === "市辖区" || city.name === "县") continue;
      const shortName = city.name.replace(/[市]$/, "");
      if (shortName.length < 2) continue;
      if (text.includes(city.name) || text.includes(shortName)) {
        if (!matchedCity || city.name.length > matchedCity.name.length) matchedCity = city;
      }
    }
  }
  if (matchedCity) return `${matchedCity.code}00`;

  const matchedProvince = provinces.find((province) => {
    const shortName = province.name.replace(/(省|市|壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区)$/, "");
    return text.includes(shortName);
  });
  return matchedProvince ? `${matchedProvince.code}0000` : null;
}

module.exports = {
  provinces,
  nativePlaceParts,
  nativePlaceLabel,
  inferNativePlace,
  inferNativePlaceFromAddress,
};

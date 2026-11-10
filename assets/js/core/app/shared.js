export const SHARE_URL = "https://abdughafur.github.io/Quarter/";
export const CALENDAR_MONTHS = [
  "январ",
  "феврал",
  "март",
  "апрел",
  "май",
  "июн",
  "июл",
  "август",
  "сентябр",
  "октябр",
  "ноябр",
  "декабр",
];
export const CALENDAR_WEEKDAYS = [
  "якшанбе",
  "душанбе",
  "сешанбе",
  "чоршанбе",
  "панҷшанбе",
  "ҷумъа",
  "шанбе",
];
export const CALENDAR_MIN_YEAR = 1900;
export const CALENDAR_MAX_YEAR = 2100;
export const PROFILE_EDIT_SCHOOL_INPUT_IDS = [
  "profileEditSchoolInput",
  "profileEditSchool2Input",
  "profileEditSchool3Input",
  "profileEditSchool4Input",
  "profileEditSchool5Input",
];

export const setStretchState = (element, offsetX, offsetY, angle, scale) => {
  element.style.setProperty("--stretch-x", `${offsetX}px`);
  element.style.setProperty("--stretch-y", `${offsetY}px`);
  element.style.setProperty("--stretch-angle", `${angle}deg`);
  element.style.setProperty("--stretch-scale", String(scale));
  element.style.setProperty("--release-x", `${-offsetX * 0.34}px`);
  element.style.setProperty("--release-y", `${-offsetY * 0.34}px`);
  element.style.setProperty("--release-angle", `${-angle * 0.38}deg`);
  element.style.setProperty("--return-x", `${offsetX * 0.12}px`);
  element.style.setProperty("--return-y", `${offsetY * 0.12}px`);
  element.style.setProperty("--return-angle", `${angle * 0.12}deg`);
};

export const clearStretchState = (element) => {
  [
    "--stretch-x",
    "--stretch-y",
    "--stretch-angle",
    "--stretch-scale",
    "--release-x",
    "--release-y",
    "--release-angle",
    "--return-x",
    "--return-y",
    "--return-angle",
  ].forEach((property) => element.style.removeProperty(property));
};

export const canvasToPngBlob = (canvas) =>
  new Promise((resolve, reject) => {
    try {
      if (typeof canvas.toBlob === "function") {
        canvas.toBlob(resolve, "image/png");
        return;
      }

      const data = canvas.toDataURL("image/png").split(",", 2)[1];
      const binary = atob(data);
      const bytes = Uint8Array.from(binary, (character) =>
        character.charCodeAt(0),
      );
      resolve(new Blob([bytes], { type: "image/png" }));
    } catch (error) {
      reject(error);
    }
  });

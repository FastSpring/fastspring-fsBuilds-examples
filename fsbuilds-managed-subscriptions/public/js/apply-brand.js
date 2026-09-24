(function () {
  const { brand, theme, display } = window.STORE_CONFIG;
  const root = document.documentElement.style;

  root.setProperty("--brand-primary", brand.primaryColor);

  // Full theme, if provided - each maps to a CSS custom property
  // style.css already references with a fallback, so omitting any of
  // these just keeps that fallback rather than breaking anything.
  if (theme) {
    if (theme.textColor) root.setProperty("--text-primary", theme.textColor);
    if (theme.backgroundColor) root.setProperty("--surface-muted", theme.backgroundColor);
    if (theme.surfaceColor) root.setProperty("--surface", theme.surfaceColor);
    if (theme.borderColor) root.setProperty("--border", theme.borderColor);
    if (theme.borderWidth) root.setProperty("--border-width", theme.borderWidth);
    if (theme.borderRadius) root.setProperty("--radius", theme.borderRadius);
    if (theme.fontFamily) root.setProperty("--font-family", theme.fontFamily);
  }

  root.setProperty("--product-image-fit", display.productImageFit);
  root.setProperty("--product-image-aspect", display.productImageAspectRatio);
  root.setProperty("--product-image-padding", display.productImagePadding);
  document.title = brand.name;

  document.addEventListener("DOMContentLoaded", () => {
    const nameEl = document.querySelector("[data-brand-name]");
    const taglineEl = document.querySelector("[data-brand-tagline]");
    if (nameEl) nameEl.textContent = brand.logoText || brand.name;
    if (taglineEl) taglineEl.textContent = brand.tagline;
  });
})();

import test from "node:test";
import assert from "node:assert/strict";
import { renderIndexPage, renderPanelPage } from "../ui.js";

test("index page exposes bilingual controls and translated chrome", () => {
  const html = renderIndexPage([]);
  assert.match(html, /data-lang-option="zh"/);
  assert.match(html, /data-lang-option="en"/);
  assert.match(html, /data-i18n="indexHeading"/);
  assert.match(html, /data-i18n="tableProject"/);
  assert.match(html, /data-i18n="openProject"/);
  assert.match(html, /researchclaw\.ui\.lang/);
});

test("panel page exposes bilingual controls and translated workflow chrome", () => {
  const html = renderPanelPage("proj_demo_001");
  assert.match(html, /data-lang-option="zh"/);
  assert.match(html, /data-lang-option="en"/);
  assert.match(html, /data-i18n="panelEyebrow"/);
  assert.match(html, /data-i18n="workflowHeading"/);
  assert.match(html, /data-i18n="currentActionHeading"/);
  assert.match(html, /data-i18n="rawStateHeading"/);
  assert.match(html, /researchclaw\.ui\.lang/);
});

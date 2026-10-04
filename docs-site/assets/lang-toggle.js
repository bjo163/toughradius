// Language toggle for the MWX-ISP Handbook (mdBook output only).
//
// The handbook keeps English and Indonesian chapters under src/en/ and
// src/id/ with matching file names. This script adds a
// language switch link to the menu bar of every rendered page and scopes the
// left sidebar to the active language:
//
//   - on /en/<page>.html  -> one link "Bahasa Indonesia" pointing to /id/<page>.html
//   - on /id/<page>.html  -> one link "English" pointing to /en/<page>.html
//   - on root-level pages (introduction, print) -> links to both language
//     entry pages, since those pages have no single counterpart; the sidebar
//     still defaults to English there
//
// Paths are rewritten on the last "/en/" or "/id/" segment only, so the
// mapping works for any hosting base path (custom domain, github.io
// project pages, `mdbook serve`, or file:// previews).
//
// GitBook renders the same sources through its own pipeline and ignores
// this file; GitBook readers use the per-chapter cross-links instead.
(function () {
  "use strict";

// counterpart returns the toggle target for the given pathname, or null
  // for pages outside the en/zh tree (handled as "neutral" pages).
  function counterpart(pathname) {
    var enMatch = pathname.match(/^(.*)\/en\/([^/]*)$/);
    if (enMatch) {
      return { href: enMatch[1] + "/id/" + enMatch[2], label: "ID", lang: "id" };
    }
    var idMatch = pathname.match(/^(.*)\/id\/([^/]*)$/);
    if (idMatch) {
      return { href: idMatch[1] + "/en/" + idMatch[2], label: "EN", lang: "en" };
    }
    return null;
  }

  function makeLink(href, label, lang, title) {
    var link = document.createElement("a");
    link.className = "lang-toggle";
    link.href = href;
    link.hreflang = lang;
    link.title = title;
    link.setAttribute("aria-label", title);
    link.textContent = label;
    return link;
  }

  function insertToggle() {
    var buttons = document.querySelector("#mdbook-menu-bar .right-buttons");
    if (!buttons || buttons.querySelector(".lang-toggle")) {
      return;
    }
    var target = counterpart(window.location.pathname);
    if (target) {
      buttons.insertBefore(
        makeLink(
          target.href,
          target.label,
          target.lang,
          target.lang === "id" ? "Beralih ke Bahasa Indonesia" : "Switch to English"
        ),
        buttons.firstChild
      );
      return;
    }
    // Neutral root pages (introduction.html, print.html, directory index):
    // offer both language entry points, resolved relative to the page.
    var id = makeLink("id/overview.html", "ID", "id", "Buku panduan Bahasa Indonesia");
    var en = makeLink("en/overview.html", "EN", "en", "English handbook");
    buttons.insertBefore(id, buttons.firstChild);
    buttons.insertBefore(en, id);
  }

  function activeLanguage() {
    return window.location.pathname.match(/\/id\//) ? "id" : "en";
  }

  function isLanguageRoot(item, lang) {
    var wrapper = item.firstElementChild;
    if (!wrapper || !wrapper.classList || !wrapper.classList.contains("chapter-link-wrapper")) {
      return false;
    }
    var link = wrapper.querySelector("a");
    if (!link) {
      return false;
    }
    var href = link.getAttribute("href") || "";
    return href.indexOf(lang + "/overview.html") !== -1;
  }

  function scopeSidebar() {
    var sidebar = document.querySelector("#mdbook-sidebar ol.chapter");
    if (!sidebar) {
      return false;
    }
    var lang = activeLanguage();
    sidebar.classList.toggle("lang-sidebar-en", lang === "en");
      sidebar.classList.toggle("lang-sidebar-id", lang === "id");
    Array.prototype.forEach.call(sidebar.children, function (item) {
      if (!item.classList || !item.classList.contains("chapter-item")) {
        return;
      }
      if (isLanguageRoot(item, "en")) {
        item.hidden = lang !== "en";
      } else if (isLanguageRoot(item, "id")) {
        item.hidden = lang !== "id";
      }
    });
    return true;
  }

  function observeSidebar() {
    if (scopeSidebar()) {
      return;
    }
    var sidebar = document.querySelector("#mdbook-sidebar");
    if (!sidebar || typeof MutationObserver === "undefined") {
      return;
    }
    var observer = new MutationObserver(function () {
      if (scopeSidebar()) {
        observer.disconnect();
      }
    });
    observer.observe(sidebar, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      insertToggle();
      observeSidebar();
    });
  } else {
    insertToggle();
    observeSidebar();
  }
})();

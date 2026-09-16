<template>
  <span class="viewport-layout-guard" aria-hidden="true"></span>
</template>

<style>
.viewport-layout-guard { display: none; }

html,
body,
#app {
  width: 100%;
  max-width: 100%;
  min-height: 100%;
}

body {
  overflow-x: hidden;
}

.app-shell {
  width: 100%;
  max-width: 100vw;
  min-height: 100dvh;
  overflow-x: hidden;
}

.main-content {
  min-width: 0;
  max-width: 100%;
  overflow-x: hidden;
}

.main-content > *,
.stack-lg,
.panel,
.toolbar,
.section-panel,
.daily-layout,
.daily-layout > *,
.form-grid,
.work-summary {
  min-width: 0;
  max-width: 100%;
}

.table-wrap {
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  overscroll-behavior-inline: contain;
  scrollbar-gutter: stable;
}

.table-wrap::-webkit-scrollbar,
.drx-table-scroll::-webkit-scrollbar {
  width: 12px;
  height: 12px;
}

.table-wrap::-webkit-scrollbar-track,
.drx-table-scroll::-webkit-scrollbar-track {
  background: #e9eff4;
  border-radius: 999px;
}

.table-wrap::-webkit-scrollbar-thumb,
.drx-table-scroll::-webkit-scrollbar-thumb {
  min-width: 36px;
  min-height: 36px;
  border: 2px solid #e9eff4;
  border-radius: 999px;
  background: #9fb3c2;
}

.table-wrap::-webkit-scrollbar-thumb:hover,
.drx-table-scroll::-webkit-scrollbar-thumb:hover {
  background: #7f99ab;
}

/* PCでは左メニューをビューポート内に固定し、右側だけを縦スクロールさせる。 */
@media (min-width: 761px) {
  html,
  body,
  #app {
    height: 100%;
    overflow: hidden;
  }

  .app-shell {
    height: 100dvh;
    min-height: 100dvh;
    overflow: hidden;
  }

  .sidebar {
    position: sticky;
    top: 0;
    height: 100dvh;
    min-height: 0;
    overflow: hidden;
    padding: clamp(14px, 2.2vh, 24px) 16px;
    gap: clamp(12px, 2.5vh, 28px);
  }

  .sidebar .brand,
  .sidebar .project-switcher,
  .sidebar .nav-list,
  .sidebar .reset-button {
    flex: 0 0 auto;
  }

  .sidebar .nav-list {
    gap: clamp(4px, 1vh, 8px);
  }

  .sidebar .nav-list button,
  .sidebar .reset-button {
    min-height: clamp(36px, 5.5vh, 44px);
    padding-top: clamp(8px, 1.3vh, 12px);
    padding-bottom: clamp(8px, 1.3vh, 12px);
  }

  .sidebar .reset-button {
    margin-top: auto;
  }

  .main-content {
    height: 100dvh;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior: contain;
  }
}

/* 高さが低いPCウィンドウでは左メニュー内の余白を圧縮して収める。 */
@media (min-width: 761px) and (max-height: 680px) {
  .sidebar {
    padding: 12px 14px;
    gap: 10px;
  }

  .sidebar .brand-mark {
    width: 34px;
    height: 34px;
    border-radius: 10px;
  }

  .sidebar .brand small {
    margin-top: 1px;
    font-size: 10px;
  }

  .sidebar .project-switcher {
    gap: 6px;
  }

  .sidebar .project-switcher select {
    min-height: 36px;
    padding: 7px 9px;
  }

  .sidebar .project-switcher-actions button {
    min-height: 32px;
    padding: 6px 8px;
  }

  .sidebar .nav-list button,
  .sidebar .reset-button {
    min-height: 34px;
    padding: 7px 10px;
  }
}

.drx-page {
  box-sizing: border-box;
  display: flex !important;
  flex-direction: column;
  width: auto;
  max-width: calc(100vw - 236px);
  height: 100dvh;
  max-height: 100dvh;
  overflow: hidden !important;
  padding-bottom: 18px !important;
}

.drx-header,
.drx-monthbar,
.drx-summary,
.drx-message {
  flex: 0 0 auto;
  min-width: 0;
  max-width: 100%;
}

.drx-table-scroll {
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  max-width: 100%;
  overflow: auto !important;
  padding-bottom: 0 !important;
  overscroll-behavior: contain;
  scrollbar-gutter: stable both-edges;
  scrollbar-color: #9fb3c2 #e9eff4;
}

.drx-table-card {
  width: max(100%, 960px);
  min-width: 960px !important;
  max-width: none;
  overflow: visible !important;
}

.drx-table {
  min-width: 960px;
}

.drx-table thead th {
  position: sticky;
  top: 0;
  z-index: 3;
}

.drx-table th:last-child {
  position: sticky;
  right: 0;
  z-index: 5;
  background: #f7f9fb;
  box-shadow: -1px 0 0 #e7edf2;
}

.drx-table td:last-child {
  position: sticky;
  right: 0;
  z-index: 2;
  background: #fff;
  box-shadow: -1px 0 0 #e7edf2;
}

.drx-row:hover td:last-child {
  background: #fbfdfe;
}

.modal-backdrop,
.weekly-backdrop {
  max-width: 100vw;
  max-height: 100dvh;
  overflow: auto;
}

.modal,
.weekly-modal {
  max-width: calc(100vw - 24px) !important;
  max-height: calc(100dvh - 24px) !important;
  overflow: auto !important;
}

@media (max-width: 900px) {
  .drx-page {
    left: 0 !important;
    max-width: 100vw;
  }
}

@media (max-width: 760px) {
  .main-content {
    width: 100%;
    max-width: 100vw;
  }

  .drx-page {
    width: 100vw;
    max-width: 100vw;
    height: 100dvh;
  }

  .drx-table-card,
  .drx-table {
    min-width: 900px !important;
  }
}
</style>
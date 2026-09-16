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

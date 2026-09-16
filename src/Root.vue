<script setup lang="ts">
import App from './App.vue'
import DailyReportNavigationBridge from './DailyReportNavigationBridge.vue'
import DailyReportReviewTool from './DailyReportReviewTool.vue'
import WeeklyReportTool from './WeeklyReportTool.vue'
import DailyReportValidationGuard from './DailyReportValidationGuard.vue'
import ScheduleTaskEnhancer from './ScheduleTaskEnhancer.vue'
import SectionEditTool from './SectionEditTool.vue'
import DailyDraftEditTool from './DailyDraftEditTool.vue'
</script>

<template>
  <App />
  <DailyReportNavigationBridge />
  <DailyReportReviewTool />
  <WeeklyReportTool />
  <DailyReportValidationGuard />
  <ScheduleTaskEnhancer />
  <SectionEditTool />
  <DailyDraftEditTool />
</template>

<script setup lang="ts">
import App from './App.vue'
import DailyReportNavigationBridge from './DailyReportNavigationBridge.vue'
import DailyReportReviewPage from './DailyReportReviewPage.vue'
import WeeklyReportTool from './WeeklyReportTool.vue'
import WeeklyReportYearlessView from './WeeklyReportYearlessView.vue'
import DailyReportValidationGuard from './DailyReportValidationGuard.vue'
import ScheduleTaskEnhancer from './ScheduleTaskEnhancer.vue'
import SectionEditTool from './SectionEditTool.vue'
import DailyDraftEditTool from './DailyDraftEditTool.vue'
import DailyReportCopyTool from './DailyReportCopyTool.vue'
import RegistrationFeedbackTool from './RegistrationFeedbackTool.vue'
import ViewportLayoutGuard from './ViewportLayoutGuard.vue'
</script>

<template>
  <App />
  <DailyReportNavigationBridge />
  <DailyReportReviewPage />
  <WeeklyReportTool />
  <WeeklyReportYearlessView />
  <DailyReportValidationGuard />
  <ScheduleTaskEnhancer />
  <SectionEditTool />
  <DailyDraftEditTool />
  <DailyReportCopyTool />
  <RegistrationFeedbackTool />
  <ViewportLayoutGuard />
</template>

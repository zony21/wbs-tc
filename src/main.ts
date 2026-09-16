import { createApp } from 'vue'
import Root from './Root.vue'
import { bootstrapDatabaseState, startDatabaseSync } from './dbSync'
import './style.css'

async function bootstrap() {
  await bootstrapDatabaseState()
  createApp(Root).mount('#app')
  startDatabaseSync()
}

void bootstrap()

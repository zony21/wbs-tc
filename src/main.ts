import { createApp } from 'vue'
import Root from './Root.vue'
import { bootstrapDatabaseState, startDatabaseSync } from './dbSync'
import './style.css'

await bootstrapDatabaseState()
createApp(Root).mount('#app')
startDatabaseSync()

<script setup>
import { ref, onMounted } from 'vue'
import { History, CheckCircle, AlertTriangle, Clock } from '@lucide/vue'

const historyLog = ref([])
const loading = ref(true)

onMounted(async () => {
  try {
    historyLog.value = await window.api.sync.getHistory()
  } catch (err) {
    console.error('Failed to load history', err)
  } finally {
    loading.value = false
  }
})

const formatDate = (isoString) => {
  return new Date(isoString).toLocaleString()
}

const formatDuration = (ms) => {
  if (ms < 1000) return `${ms}ms`
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  return `${min}m ${sec % 60}s`
}

const formatNumber = (num) => {
  return Number(num).toLocaleString()
}
</script>

<template>
  <div class="h-full flex flex-col bg-gray-50">
    <!-- Header -->
    <header class="px-5 py-3 border-b border-gray-200 flex items-center gap-2 bg-white z-10">
      <History class="w-4 h-4 text-gray-500" />
      <h1 class="text-sm font-bold text-gray-800 tracking-wide">Sync History</h1>
    </header>

    <!-- Main Content -->
    <div class="flex-1 overflow-auto p-6">
      <div v-if="loading" class="text-center py-12 text-gray-500 font-medium">
        Loading history...
      </div>
      
      <div v-else-if="historyLog.length === 0" class="text-center py-12 text-gray-500 font-medium">
        No sync history found. Run your first sync!
      </div>
      
      <div v-else class="space-y-4 w-full">
        <div 
          v-for="entry in historyLog" 
          :key="entry.id"
          class="card p-5"
        >
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-3">
              <CheckCircle v-if="entry.status === 'completed'" class="w-6 h-6 text-green-500" />
              <AlertTriangle v-else-if="entry.status === 'error'" class="w-6 h-6 text-red-500" />
              <AlertTriangle v-else-if="entry.status === 'aborted'" class="w-6 h-6 text-amber-500" />
              <span v-else class="w-6 h-6 text-blue-500 flex items-center justify-center">
                <History class="w-5 h-5" />
              </span>
              
              <h3 class="text-lg font-semibold text-gray-900">{{ entry.profileName }}</h3>
            </div>
            <div class="text-xs text-gray-500 bg-gray-100 px-3 py-1.5 rounded-full border border-gray-200 flex items-center gap-1.5 font-medium">
              <Clock class="w-3.5 h-3.5" />
              {{ formatDate(entry.timestamp) }}
            </div>
          </div>
          
          <div class="grid grid-cols-4 gap-6 pl-9 border-t border-gray-100 pt-4 mt-2">
            <div>
              <div class="text-[11px] tracking-wider text-gray-500 font-semibold mb-1">Status</div>
              <div class="text-sm font-bold capitalize" :class="{
                'text-green-600': entry.status === 'completed',
                'text-red-600': entry.status === 'error',
                'text-amber-600': entry.status === 'aborted'
              }">{{ entry.status }}</div>
            </div>
            <div>
              <div class="text-[11px] tracking-wider text-gray-500 font-semibold mb-1">Tables</div>
              <div class="text-sm font-medium text-gray-900">{{ entry.tables }}</div>
            </div>
            <div>
              <div class="text-[11px] tracking-wider text-gray-500 font-semibold mb-1">Rows Copied</div>
              <div class="text-sm font-medium text-gray-900">{{ formatNumber(entry.rows) }}</div>
            </div>
            <div>
              <div class="text-[11px] tracking-wider text-gray-500 font-semibold mb-1">Duration</div>
              <div class="text-sm font-medium text-gray-900">{{ formatDuration(entry.durationMs) }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

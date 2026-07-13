<script setup>
import { ref, watch, onUnmounted, nextTick } from 'vue'
import { DownloadCloud, CheckCircle, AlertTriangle, X, RefreshCw, Terminal } from '@lucide/vue'
import { useAppStore } from '../../stores/appStore'

const props = defineProps({
  show: Boolean,
  tables: Array, // Array of { name, mode }
  profile: Object
})

const emit = defineEmits(['close'])

const store = useAppStore()

const syncId = ref(null)
const stats = ref(null)
const unsubscribe = ref(null)
const logUnsubscribe = ref(null)
const logs = ref([])
const logContainer = ref(null)
const elapsedSeconds = ref(0)
let animationFrameId = null

const startTimer = () => {
  stopTimer()
  elapsedSeconds.value = 0
  
  const tick = () => {
    if (stats.value && (stats.value.status === 'starting' || stats.value.status === 'syncing')) {
      if (stats.value.startTime) {
        elapsedSeconds.value = Math.floor((Date.now() - stats.value.startTime) / 1000)
      }
      animationFrameId = requestAnimationFrame(tick)
    }
  }
  
  animationFrameId = requestAnimationFrame(tick)
}

const stopTimer = () => {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }
}

watch(() => props.show, async (newVal) => {
  if (newVal) {
    startSync()
  } else {
    reset()
  }
})

onUnmounted(() => {
  reset()
  stopTimer()
})

const startSync = async () => {
  logs.value = []
  stats.value = {
    status: 'starting',
    totalTables: props.tables.length,
    completedTables: 0,
    totalRows: 0,
    currentTable: 'Initializing SSH Tunnel...',
    startTime: Date.now()
  }

  startTimer()

  const profileRaw = JSON.parse(JSON.stringify(props.profile))
  const tablesRaw = JSON.parse(JSON.stringify(props.tables))
  syncId.value = await window.api.sync.start(profileRaw, tablesRaw)
  
  unsubscribe.value = window.api.sync.onProgress(syncId.value, (newStats) => {
    stats.value = newStats
    if (newStats.status === 'completed' || newStats.status === 'error' || newStats.status === 'aborted') {
      stopTimer()
      store.notify(newStats.status === 'completed' ? 'success' : 'error', 
                   `Sync ${newStats.status}! Rows synced: ${newStats.totalRows}`)
      if (unsubscribe.value) {
        unsubscribe.value()
        unsubscribe.value = null
      }
    }
  })

  logUnsubscribe.value = window.api.sync.onLog(syncId.value, (logEvent) => {
    logs.value.push(logEvent)
    nextTick(() => {
      if (logContainer.value) {
        logContainer.value.scrollTop = logContainer.value.scrollHeight
      }
    })
  })
}

const abortSync = async () => {
  if (syncId.value && (stats.value.status === 'starting' || stats.value.status === 'syncing')) {
    if (confirm('Are you sure you want to abort the sync process? Data might be incomplete.')) {
      await window.api.sync.abort(syncId.value)
    }
  } else {
    emit('close')
  }
}

const reset = () => {
  if (unsubscribe.value) {
    unsubscribe.value()
    unsubscribe.value = null
  }
  if (logUnsubscribe.value) {
    logUnsubscribe.value()
    logUnsubscribe.value = null
  }
  syncId.value = null
  stats.value = null
  logs.value = []
  stopTimer()
}

const formatNumber = (num) => {
  return Number(num || 0).toLocaleString()
}

const formatETA = (seconds) => {
  if (!seconds || seconds <= 0) return ''
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes < 60) {
    return `${minutes}m ${remainingSeconds}s`
  }
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}h ${remainingMinutes}m`
}

const formatTime = (ts) => {
  return new Date(ts).toLocaleTimeString([], { hour12: false })
}
</script>

<template>
  <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm">
    <div class="bg-white rounded shadow-xl w-full max-w-4xl p-6 border border-gray-200 flex flex-col max-h-[90vh]">
      
      <!-- Header -->
      <div class="flex items-center justify-between mb-6 pb-4 border-b border-gray-200 shrink-0">
        <h2 class="text-lg font-bold text-gray-900 flex items-center gap-2  tracking-wider">
          <DownloadCloud class="w-5 h-5 text-blue-600" />
          Synchronizing Database
        </h2>
        <button 
          v-if="stats && (stats.status === 'completed' || stats.status === 'error' || stats.status === 'aborted')" 
          @click="emit('close')" 
          class="text-gray-400 hover:text-gray-700 transition-colors p-1 rounded-md hover:bg-gray-100"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Content -->
      <div v-if="stats" class="space-y-6 flex-1 overflow-hidden flex flex-col">
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 shrink-0">
          <div class="flex items-center gap-4">
            <!-- Status Indicator -->
            <div v-if="stats.status === 'starting' || stats.status === 'syncing'" class="p-4 rounded-full bg-blue-50 text-blue-600 animate-pulse-slow shrink-0">
              <RefreshCw class="w-8 h-8 animate-spin" />
            </div>
            <div v-else-if="stats.status === 'completed'" class="p-4 rounded-full bg-green-50 text-green-600 shrink-0">
              <CheckCircle class="w-8 h-8" />
            </div>
            <div v-else class="p-4 rounded-full bg-red-50 text-red-600 shrink-0">
              <AlertTriangle class="w-8 h-8" />
            </div>

            <div>
              <h3 class="text-base font-bold text-gray-900">
                {{ stats.status === 'starting' ? 'Starting...' : 
                   stats.status === 'syncing' ? 'Sync in progress' : 
                   stats.status === 'completed' ? 'Synchronization Complete' : 
                   stats.status === 'aborted' ? 'Synchronization Aborted' : 'Synchronization Failed' }}
              </h3>
              <p v-if="stats.status === 'syncing' && stats.currentTable" class="text-xs text-gray-500 mt-1 font-mono">
                Processing: <span class="text-blue-600 font-bold">{{ stats.currentTable }}</span>
              </p>
            </div>
          </div>

          <!-- Progress Stats -->
          <div class="grid grid-cols-2 gap-4">
            <div class="bg-gray-50 p-3 rounded border border-gray-200">
              <div class="text-[10px] text-gray-500  font-bold tracking-wider mb-1 flex justify-between">
                <span>Tables</span>
                <span v-if="elapsedSeconds > 0" class="text-gray-900 font-bold normal-case">
                  {{ formatETA(elapsedSeconds) }}
                </span>
              </div>
              <div class="text-lg font-bold text-gray-900">{{ stats.completedTables }} <span class="text-gray-400 text-sm">/ {{ stats.totalTables }}</span></div>
            </div>
            <div class="bg-gray-50 p-3 rounded border border-gray-200">
              <div class="text-[10px] text-gray-500  font-bold tracking-wider mb-1 flex justify-between">
                <span>Rows Copied</span>
                <span v-if="stats.status === 'syncing' && stats.etaSeconds > 0" class="text-blue-600 font-bold normal-case">
                  ETA: {{ formatETA(stats.etaSeconds) }}
                </span>
              </div>
              <div class="text-lg font-bold text-gray-900">
                {{ formatNumber(stats.totalRows) }}
                <span v-if="stats.totalRowsToSync > 0" class="text-[10px] font-normal text-gray-500 block">/ {{ formatNumber(stats.totalRowsToSync) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Terminal Logs -->
        <div class="flex-1 min-h-[200px] flex flex-col bg-[#0d1117] rounded border border-gray-800 overflow-hidden mt-2">
          <div class="bg-[#161b22] px-3 py-1.5 flex items-center justify-between border-b border-gray-800">
            <div class="flex items-center gap-2 text-gray-400">
              <Terminal class="w-3.5 h-3.5" />
              <span class="text-[11px] font-bold  tracking-wider">Sync Logs</span>
            </div>
          </div>
          <div ref="logContainer" class="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-1.5">
            <div v-for="(log, idx) in logs" :key="idx" class="flex gap-3">
              <span class="text-gray-500 shrink-0">[{{ formatTime(log.timestamp) }}]</span>
              <span 
                :class="{
                  'text-gray-300': log.type === 'info',
                  'text-emerald-400 font-bold': log.type === 'success',
                  'text-red-400 font-bold': log.type === 'error',
                  'text-amber-400 font-bold': log.type === 'warning'
                }"
                class="break-all"
              >
                {{ log.message }}
              </span>
            </div>
            <div v-if="stats.status === 'error'" class="mt-4 p-2 bg-red-900/30 border border-red-800 text-red-400 rounded">
              <div class="font-bold mb-1">Fatal Error:</div>
              {{ stats.error }}
            </div>
          </div>
        </div>

      </div>

      <!-- Footer -->
      <div class="mt-6 pt-4 border-t border-gray-200 shrink-0">
        <button 
          v-if="stats && (stats.status === 'starting' || stats.status === 'syncing')" 
          @click="abortSync" 
          class="w-full py-2.5 text-sm font-bold  tracking-wider text-red-600 bg-white border border-red-200 hover:bg-red-50 hover:border-red-300 rounded flex items-center justify-center gap-2 transition-colors shadow-sm"
        >
          <X class="w-4 h-4" /> Abort Sync
        </button>
        <button 
          v-else 
          @click="emit('close')" 
          class="btn-primary w-full py-2.5 text-sm font-bold  tracking-wider"
        >
          Close Window
        </button>
      </div>

    </div>
  </div>
</template>

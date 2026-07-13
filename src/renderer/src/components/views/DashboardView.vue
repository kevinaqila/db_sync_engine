<script setup>
import { onMounted, onUnmounted, watch, ref, computed } from 'vue'
import { useAppStore } from '../../stores/appStore'
import { Database, RefreshCw, DownloadCloud, AlertTriangle, Search, Trash2, CheckSquare, Square, Table2 } from '@lucide/vue'
import SyncModal from '../sync/SyncModal.vue'

const store = useAppStore()

const showSyncModal = ref(false)
const searchQuery = ref('')
const searchInput = ref(null)
const activeTemplateId = ref('custom')
const globalRowLimit = ref('')
const globalRowOrder = ref('newest')

const applyBulkMode = (mode) => {
  if (!mode) return
  filteredTables.value.forEach(t => {
    store.tableModes[t.name] = mode
  })
}

// Global hotkey for search
const handleKeydown = (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    e.preventDefault()
    searchInput.value?.focus()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})

const filteredTables = computed(() => {
  if (!searchQuery.value) return store.tables
  const q = searchQuery.value.toLowerCase()
  return store.tables.filter(t => t.name.toLowerCase().includes(q))
})

const selectAllFiltered = () => {
  filteredTables.value.forEach(t => {
    if (!store.selectedTables.includes(t.name)) {
      store.selectedTables.push(t.name)
    }
  })
}

const deselectAllFiltered = () => {
  filteredTables.value.forEach(t => {
    const idx = store.selectedTables.indexOf(t.name)
    if (idx > -1) store.selectedTables.splice(idx, 1)
  })
}

// ----------------- TEMPLATE LOGIC -----------------
const showTemplateInput = ref(false)
const newTemplateName = ref('')

const applyTemplate = (tplId) => {
  if (tplId === 'custom') return
  const tpl = store.activeProfile.templates?.find(t => t.id === tplId)
  if (tpl) {
    store.selectedTables = [...tpl.selectedTables]
    store.tableModes = JSON.parse(JSON.stringify(tpl.tableModes))
  }
}

const confirmSaveTemplate = async () => {
  if (!newTemplateName.value.trim()) {
    showTemplateInput.value = false
    return
  }
  
  try {
    const savedTpl = await store.saveTemplate(newTemplateName.value, store.selectedTables, store.tableModes)
    store.notify('success', `Template "${savedTpl.name}" saved!`)
    activeTemplateId.value = savedTpl.id
    showTemplateInput.value = false
    newTemplateName.value = ''
  } catch (err) {
    store.notify('error', `Save template failed: ${err.message}`)
  }
}

const updateCurrentTemplate = async () => {
  if (activeTemplateId.value === 'custom') return
  try {
    const tpl = store.activeProfile.templates.find(t => t.id === activeTemplateId.value)
    await store.saveTemplate(tpl.name, store.selectedTables, store.tableModes, tpl.id)
    store.notify('success', `Template "${tpl.name}" updated!`)
  } catch (err) {
    store.notify('error', `Update template failed: ${err.message}`)
  }
}

const deleteTemplate = async (tplId) => {
  try {
    await store.deleteTemplate(tplId)
    store.notify('success', 'Template deleted')
    activeTemplateId.value = 'custom'
  } catch (err) {
    store.notify('error', `Delete template failed: ${err.message}`)
  }
}

// ----------------- SYNC LOGIC -----------------
const syncTablesPayload = ref([])

const startSync = () => {
  if (store.selectedTables.length === 0) return
  
  // Format the payload needed by the sync engine and the modal
  syncTablesPayload.value = store.selectedTables.map(tableName => {
    const tableObj = store.tables.find(t => t.name === tableName)
    return {
      name: tableName,
      mode: store.tableModes[tableName] || 'full',
      rowCount: tableObj ? tableObj.rowCount : 0,
      limit: globalRowLimit.value && globalRowLimit.value > 0 ? Number(globalRowLimit.value) : null,
      order: globalRowOrder.value
    }
  })
  
  showSyncModal.value = true
}

// Watchers
watch(() => store.activeProfileId, (newId) => {
  if (newId) {
    activeTemplateId.value = 'custom'
    showTemplateInput.value = false
    if (!store.tablesFetched && !store.tableLoading) {
      store.fetchTables()
    }
    searchQuery.value = ''
  }
}, { immediate: true })
</script>

<template>
  <div class="h-full flex flex-col bg-gray-50" v-if="store.activeProfile">
    <!-- Header -->
    <header class="px-5 py-3 bg-white border-b border-gray-200 z-10 flex items-center justify-between">
      <div>
        <h1 class="text-lg font-bold text-gray-800 tracking-tight">{{ store.activeProfile.name }}</h1>
        <div class="flex items-center gap-2 text-[11px] text-gray-500 mt-0.5 font-mono">
          <Database class="w-3.5 h-3.5" />
          <span class="font-medium ">{{ store.activeProfile.dbType }}</span>
          <span class="text-gray-300">•</span>
          <span>{{ store.activeProfile.sshHost }}</span>
          <span class="text-gray-300">→</span>
          <span>{{ store.activeProfile.dbHost }}:{{ store.activeProfile.dbPort }}</span>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <div class="flex-1 flex flex-col overflow-hidden">
      
      <!-- Loading State -->
      <div v-if="store.tableLoading" class="flex flex-col items-center justify-center h-full text-gray-500 p-6">
        <RefreshCw class="w-10 h-10 animate-spin text-blue-600 mb-4" />
        <p class="text-lg font-medium text-gray-900">Connecting to database...</p>
        <p class="text-sm mt-1">Establishing SSH tunnel and fetching schema.</p>
      </div>

      <!-- Error State -->
      <div v-else-if="store.tableError" class="flex flex-col items-center justify-center h-full max-w-md mx-auto text-center p-6">
        <AlertTriangle class="w-12 h-12 text-red-500 mb-4" />
        <h3 class="text-lg font-bold text-gray-900 mb-2">Connection Failed</h3>
        <p class="text-sm text-gray-600 bg-red-50 p-4 rounded-md border border-red-200 break-words w-full text-left font-mono">
          {{ store.tableError }}
        </p>
        <button @click="store.fetchTables" class="btn-primary mt-6">Try Again</button>
      </div>

      <!-- Content Area -->
      <div v-else-if="store.tablesFetched" class="flex flex-col h-full overflow-hidden">
        
        <!-- Toolbar Panel -->
        <div class="bg-white border-b border-gray-200 p-3 shrink-0 flex flex-col gap-3">
          
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-3">
            
            <!-- Left Side: Search & Selection -->
            <div class="flex items-center gap-3 w-full md:w-auto">
              <div class="relative flex-1 md:w-64 lg:w-80">
                <Search class="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input 
                  ref="searchInput"
                  v-model="searchQuery" 
                  type="text" 
                  placeholder="Search tables... (Ctrl+F)" 
                  class="form-input pl-9 text-sm py-1.5"
                />
              </div>
              
              <div class="flex gap-2 text-xs whitespace-nowrap">
                <button @click="selectAllFiltered" class="text-blue-600 hover:text-blue-800 font-medium hover:underline">Select All</button>
                <span class="text-gray-300">|</span>
                <button @click="deselectAllFiltered" class="text-gray-500 hover:text-gray-700 hover:underline">Clear</button>
              </div>
            </div>

            <!-- Right Side: Template Management -->
            <div class="flex items-center gap-2 bg-gray-50 p-1 rounded border border-gray-200 w-full md:w-auto overflow-x-auto">
              <span class="text-xs font-medium text-gray-700 pl-1 whitespace-nowrap">Template:</span>
              <select v-model="activeTemplateId" @change="applyTemplate(activeTemplateId)" class="form-input py-1 px-2 text-xs w-40 bg-white">
                <option value="custom">Custom Selection</option>
                <option v-for="tpl in (store.activeProfile.templates || [])" :key="tpl.id" :value="tpl.id">
                  {{ tpl.name }}
                </option>
              </select>
              
              <div class="flex items-center gap-1 shrink-0" v-if="activeTemplateId !== 'custom'">
                <button @click="updateCurrentTemplate" class="text-xs font-medium text-blue-600 hover:bg-blue-50 px-2 py-1 rounded border border-blue-200 bg-white">Update</button>
                <button @click="deleteTemplate(activeTemplateId)" class="text-xs font-medium text-red-600 hover:bg-red-50 px-2 py-1 rounded border border-red-200 bg-white">Delete</button>
              </div>
              
              <div class="flex items-center border-l border-gray-300 pl-2 ml-1 shrink-0" v-if="store.selectedTables.length > 0">
                <div v-if="showTemplateInput" class="flex items-center gap-2">
                  <input v-model="newTemplateName" type="text" placeholder="Name..." class="form-input py-1 px-2 text-xs w-28" @keyup.enter="confirmSaveTemplate" />
                  <button @click="confirmSaveTemplate" class="text-xs font-bold text-blue-600 hover:underline">Save</button>
                  <button @click="showTemplateInput = false" class="text-xs text-gray-500 hover:underline">Cancel</button>
                </div>
                <button v-else @click="showTemplateInput = true; newTemplateName = ''" class="text-xs font-medium text-gray-700 hover:bg-gray-200 px-2 py-1 rounded border border-gray-300 bg-white shadow-sm">
                  Save As New
                </button>
              </div>
            </div>
          </div>

          <!-- Bottom Toolbar: Bulk Actions & Sync -->
          <div class="flex flex-col md:flex-row md:items-center justify-between bg-blue-50/50 p-2.5 rounded border border-blue-100 gap-3">
            <div class="flex flex-wrap items-center gap-4">
              <div class="flex items-center gap-2">
                <label class="text-xs font-medium text-gray-700 whitespace-nowrap">Set All To:</label>
                <div class="flex rounded border border-gray-300 overflow-hidden">
                  <button @click="applyBulkMode('full')" class="bg-white hover:bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 border-r border-gray-300 transition-colors">
                    Data + Structure
                  </button>
                  <button @click="applyBulkMode('structure')" class="bg-white hover:bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors">
                    Structure Only
                  </button>
                </div>
              </div>

              <div class="flex items-center gap-2 border-l border-gray-300 pl-4">
                <label class="text-xs font-medium text-gray-700 whitespace-nowrap">Row Limit:</label>
                <input v-model="globalRowLimit" type="number" placeholder="Unlimited" class="form-input py-1 px-2 text-xs w-24" min="0" />
                <select v-if="globalRowLimit && Number(globalRowLimit) > 0" v-model="globalRowOrder" class="form-input py-1 px-2 text-xs w-24 bg-white border border-gray-300 rounded shadow-sm">
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                </select>
              </div>
            </div>

            <div class="flex items-center gap-2 w-full md:w-auto">
              <button @click="store.fetchTables" class="btn-secondary py-1 px-3 text-xs w-full md:w-auto" :disabled="store.tableLoading">
                <RefreshCw class="w-3.5 h-3.5" :class="{'animate-spin': store.tableLoading}" />
                Refresh
              </button>
              <button @click="startSync" class="btn-primary py-1 px-3 text-xs w-full md:w-auto" :disabled="store.selectedTables.length === 0 || store.tableLoading">
                <DownloadCloud class="w-3.5 h-3.5" />
                Start Sync ({{ store.selectedTables.length }})
              </button>
            </div>
          </div>
        </div>

        <!-- Table List -->
        <div class="flex-1 overflow-auto p-6">
          <div class="card overflow-hidden">
            <table class="w-full text-left text-sm whitespace-nowrap">
              <thead class="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th class="px-4 py-3 w-12 text-center text-gray-500 font-medium">Select</th>
                  <th class="px-4 py-3 text-gray-700 font-medium">Table Name</th>
                  <th class="px-4 py-3 w-32 text-right text-gray-700 font-medium">Total Rows</th>
                  <th class="px-4 py-3 w-64 text-gray-700 font-medium">Sync Mode</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200">
                <tr v-for="table in filteredTables" :key="table.name" 
                    class="hover:bg-gray-50 transition-colors"
                    :class="{'bg-blue-50/30': store.selectedTables.includes(table.name)}">
                  <td class="px-4 py-2.5 text-center">
                    <input 
                      type="checkbox" 
                      :checked="store.selectedTables.includes(table.name)" 
                      @change="store.toggleTable(table.name)"
                      class="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                    />
                  </td>
                  <td class="px-4 py-2.5 font-mono text-gray-900 cursor-pointer" @click="store.toggleTable(table.name)">
                    {{ table.name }}
                  </td>
                  <td class="px-4 py-2.5 text-right text-gray-600 font-mono">
                    {{ Number(table.rowCount).toLocaleString() }}
                  </td>
                  <td class="px-4 py-2.5">
                    <div v-if="store.selectedTables.includes(table.name)" class="flex items-center gap-4">
                      <label class="flex items-center gap-1.5 cursor-pointer text-gray-700 opacity-70" title="Structure is always synced">
                        <input type="checkbox" checked disabled class="w-3.5 h-3.5 text-blue-600 rounded border-gray-300">
                        <span class="text-xs font-medium">Structure</span>
                      </label>
                      <label class="flex items-center gap-1.5 cursor-pointer text-gray-700 hover:text-blue-600">
                        <input 
                          type="checkbox" 
                          :checked="store.tableModes[table.name] === 'full' || !store.tableModes[table.name]" 
                          @change="store.tableModes[table.name] = $event.target.checked ? 'full' : 'structure'"
                          class="w-3.5 h-3.5 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                        >
                        <span class="text-xs font-medium">Data</span>
                      </label>
                    </div>
                    <span v-else class="text-gray-400 italic px-2">-</span>
                  </td>
                </tr>
                <tr v-if="filteredTables.length === 0">
                  <td colspan="4" class="px-4 py-8 text-center text-gray-500">
                    No tables found matching your search.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>

    </div>

    <!-- Sync Modal -->
    <SyncModal 
      :show="showSyncModal" 
      :profile="store.activeProfile" 
      :tables="syncTablesPayload"
      @close="showSyncModal = false"
    />
  </div>
</template>

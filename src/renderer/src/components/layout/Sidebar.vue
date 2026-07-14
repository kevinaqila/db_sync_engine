<script setup>
import { ref, onMounted } from 'vue'
import { useAppStore } from '../../stores/appStore'
import { Plus, Database, History, Edit, Trash2 } from '@lucide/vue'

const store = useAppStore()
const appVersion = ref('1.0.0')

onMounted(async () => {
  if (window.api && window.api.getVersion) {
    appVersion.value = await window.api.getVersion()
  }
})

const selectProfile = (id) => {
  store.setActiveProfile(id)
}

const deleteProfile = async (id, name, event) => {
  event.stopPropagation()
  if (confirm(`Are you sure you want to delete profile "${name}"?`)) {
    await store.deleteProfile(id)
    store.notify('success', `Profile "${name}" deleted successfully`)
  }
}

const editProfile = (profile, event) => {
  event.stopPropagation()
  store.openEditProfile(profile)
}
</script>

<template>
  <aside class="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between select-none text-slate-300">
    <div class="flex flex-col flex-1 overflow-y-auto">
      <!-- Section header -->
      <div class="px-5 py-4 flex items-center justify-between">
        <span class="text-[11px] font-bold text-slate-400 tracking-wider">Connections</span>
        <button
          @click="store.openNewProfile"
          class="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          title="New Profile"
        >
          <Plus class="w-4 h-4" />
        </button>
      </div>

      <!-- Connection Profiles List -->
      <div class="flex-1 px-3 pb-3 overflow-y-auto space-y-1">
        <div v-if="store.profiles.length === 0" class="text-sm text-slate-500 text-center py-6 px-2">
          No profiles yet.
        </div>
        
        <div
          v-for="profile in store.profiles"
          :key="profile.id"
          @click="selectProfile(profile.id)"
          class="group flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-colors"
          :class="[
            (store.activeProfileId === profile.id && store.currentView === 'dashboard')
              ? 'bg-blue-600 text-white'
              : 'hover:bg-slate-800 text-slate-300 hover:text-white'
          ]"
        >
          <div class="flex items-center gap-3 overflow-hidden">
            <div class="p-1.5 rounded-md" :class="(store.activeProfileId === profile.id && store.currentView === 'dashboard') ? 'bg-blue-700/50' : 'bg-slate-800 group-hover:bg-slate-700'">
              <Database class="w-3.5 h-3.5" :class="(store.activeProfileId === profile.id && store.currentView === 'dashboard') ? 'text-white' : 'text-slate-400 group-hover:text-white'" />
            </div>
            <div class="flex flex-col overflow-hidden">
              <span class="text-sm font-medium truncate">{{ profile.name }}</span>
              <span class="text-[10px] truncate opacity-70 mt-0.5">{{ profile.dbType }}</span>
            </div>
          </div>
          
          <!-- Action Buttons -->
          <div class="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              @click="editProfile(profile, $event)"
              class="p-1.5 rounded-md hover:bg-slate-700 hover:text-white transition-colors"
              :class="(store.activeProfileId === profile.id && store.currentView === 'dashboard') ? 'hover:bg-blue-700 text-blue-100' : 'text-slate-400'"
              title="Edit"
            >
              <Edit class="w-3.5 h-3.5" />
            </button>
            <button
              @click="deleteProfile(profile.id, profile.name, $event)"
              class="p-1.5 rounded-md hover:bg-red-500 hover:text-white transition-colors"
              :class="(store.activeProfileId === profile.id && store.currentView === 'dashboard') ? 'hover:bg-blue-700 text-blue-100' : 'text-slate-400'"
              title="Delete"
            >
              <Trash2 class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- History Footer Link & Version -->
    <div class="p-3">
      <button
        @click="store.currentView = 'history'"
        class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors mb-2"
        :class="store.currentView === 'history' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'"
      >
        <History class="w-4 h-4" />
        <span>Sync History</span>
      </button>
      <div class="text-center text-[10px] text-slate-600">
        v{{ appVersion }}
      </div>
    </div>
  </aside>
</template>

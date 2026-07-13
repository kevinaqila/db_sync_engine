<script setup>
import { useAppStore } from '../../stores/appStore'
import { Database, Plus } from '@lucide/vue'

const store = useAppStore()
</script>

<template>
  <div class="h-full flex flex-col items-center justify-center p-8 text-center select-none bg-white">
    <div class="max-w-md space-y-6">
      <div class="flex justify-center">
        <div class="p-6 rounded-full bg-blue-50 text-blue-600 mb-2">
          <Database class="w-12 h-12" />
        </div>
      </div>

      <div class="space-y-3">
        <h2 class="text-3xl font-bold tracking-tight text-gray-900">Database Synchronizer</h2>
        <p class="text-base text-gray-500 leading-relaxed">
          Sync your remote production or staging databases safely to your local machine via secure SSH tunnels.
        </p>
      </div>

      <div class="flex justify-center pt-4">
        <button @click="store.openNewProfile" class="btn-primary py-2.5 px-6 text-base">
          <Plus class="w-5 h-5" />
          <span>Create First Connection</span>
        </button>
      </div>
    </div>
  </div>
</template>

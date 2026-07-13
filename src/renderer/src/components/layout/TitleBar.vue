<script setup>
import { Minus, Square, X } from '@lucide/vue'

const minimize = () => window.api.window.minimize()
const maximize = () => window.api.window.maximize()
const close = () => window.api.window.close()
</script>

<template>
  <header class="drag-region flex items-center justify-between h-8 bg-gray-200 border-b border-gray-300 pl-3 pr-0 select-none">
    <div class="flex items-center gap-2">
      <span class="text-[11px] font-bold tracking-wide text-gray-700">DB Sync Engine</span>
    </div>
    <div class="no-drag flex items-center h-full">
      <button @click="minimize" class="flex items-center justify-center w-10 h-full text-gray-600 hover:bg-gray-300 transition-colors">
        <Minus class="w-3.5 h-3.5" />
      </button>
      <button @click="maximize" class="flex items-center justify-center w-10 h-full text-gray-600 hover:bg-gray-300 transition-colors">
        <Square class="w-3 h-3" />
      </button>
      <button @click="close" class="flex items-center justify-center w-10 h-full text-gray-600 hover:bg-red-500 hover:text-white transition-colors">
        <X class="w-3.5 h-3.5" />
      </button>
    </div>
  </header>
</template>

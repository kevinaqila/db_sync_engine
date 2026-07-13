<script setup>
import { ref, onMounted, watch } from 'vue'
import { useAppStore } from '../../stores/appStore'
import { ArrowLeft, ShieldCheck, Database, Server, RefreshCw } from '@lucide/vue'

const props = defineProps({
  profile: {
    type: Object,
    default: null
  }
})

const store = useAppStore()

// Local state for form
const id = ref(null)
const name = ref('')
const dbType = ref('mysql')
const sshHost = ref('')
const sshPort = ref(22)
const sshUsername = ref('')
const authMethod = ref('key')
const keyPath = ref('')
const passphrase = ref('')
const sshPassword = ref('')
const dbHost = ref('localhost')
const dbPort = ref(3306)
const dbUser = ref('root')
const dbPassword = ref('')
const dbName = ref('')

const localDbHost = ref('127.0.0.1')
const localDbPort = ref(3306)
const localDbUser = ref('root')
const localDbPassword = ref('')
const localDbName = ref('')
const isTestingSsh = ref(false)
const isTestingFull = ref(false)

// Set default port when DB type changes
watch(dbType, (newType) => {
  if (newType === 'mysql') dbPort.value = 3306
  else if (newType === 'postgresql') dbPort.value = 5432
})

onMounted(() => {
  if (props.profile) {
    id.value = props.profile.id
    name.value = props.profile.name
    dbType.value = props.profile.dbType || 'mysql'
    sshHost.value = props.profile.sshHost
    sshPort.value = props.profile.sshPort || 22
    sshUsername.value = props.profile.sshUsername
    authMethod.value = props.profile.authMethod || 'key'
    keyPath.value = props.profile.keyPath || ''
    passphrase.value = props.profile.passphrase || ''
    sshPassword.value = props.profile.sshPassword || ''
    dbHost.value = props.profile.dbHost || 'localhost'
    dbPort.value = props.profile.dbPort || 3306
    dbUser.value = props.profile.dbUser || 'root'
    dbPassword.value = props.profile.dbPassword || ''
    dbName.value = props.profile.dbName || ''
    localDbHost.value = props.profile.localDbHost || '127.0.0.1'
    localDbPort.value = props.profile.localDbPort || 3306
    localDbUser.value = props.profile.localDbUser || 'root'
    localDbPassword.value = props.profile.localDbPassword || ''
    localDbName.value = props.profile.localDbName || ''
  }
})

const selectKeyFile = async () => {
  const path = await window.api.openFile()
  if (path) {
    keyPath.value = path
  }
}

const testSsh = async () => {
  if (!sshHost.value || !sshUsername.value) {
    store.notify('error', 'Please fill in SSH Host and Username')
    return
  }

  isTestingSsh.value = true
  try {
    const result = await window.api.connection.testSsh({
      sshHost: sshHost.value,
      sshPort: Number(sshPort.value),
      sshUsername: sshUsername.value,
      authMethod: authMethod.value,
      keyPath: keyPath.value,
      passphrase: passphrase.value,
      password: sshPassword.value
    })

    if (result.success) {
      store.notify('success', 'SSH connection successful!')
    } else {
      store.notify('error', `SSH failed: ${result.message}`)
    }
  } catch (err) {
    store.notify('error', err.message)
  } finally {
    isTestingSsh.value = false
  }
}

const testFullConnection = async () => {
  if (!sshHost.value || !sshUsername.value || !dbName.value) {
    store.notify('error', 'Please fill in SSH details and Database Name')
    return
  }

  isTestingFull.value = true
  try {
    const result = await window.api.connection.testFull({
      sshHost: sshHost.value,
      sshPort: Number(sshPort.value),
      sshUsername: sshUsername.value,
      authMethod: authMethod.value,
      keyPath: keyPath.value,
      passphrase: passphrase.value,
      sshPassword: sshPassword.value,
      dbType: dbType.value,
      dbHost: dbHost.value,
      dbPort: Number(dbPort.value),
      dbUser: dbUser.value,
      dbPassword: dbPassword.value,
      dbName: dbName.value
    })

    if (result.success) {
      store.notify('success', `Connection Success: ${result.message}`)
    } else {
      store.notify('error', `Connection Failed: ${result.message}`)
    }
  } catch (err) {
    store.notify('error', err.message)
  } finally {
    isTestingFull.value = false
  }
}

const save = async () => {
  if (!name.value || !sshHost.value || !sshUsername.value || !dbName.value) {
    store.notify('error', 'Please fill in all required fields')
    return
  }

  const profileData = {
    ...(props.profile || {}),
    id: id.value,
    name: name.value,
    dbType: dbType.value,
    sshHost: sshHost.value,
    sshPort: Number(sshPort.value),
    sshUsername: sshUsername.value,
    authMethod: authMethod.value,
    keyPath: keyPath.value,
    passphrase: passphrase.value,
    sshPassword: sshPassword.value,
    dbHost: dbHost.value,
    dbPort: Number(dbPort.value),
    dbUser: dbUser.value,
    dbPassword: dbPassword.value,
    dbName: dbName.value,
    localDbHost: localDbHost.value,
    localDbPort: Number(localDbPort.value),
    localDbUser: localDbUser.value,
    localDbPassword: localDbPassword.value,
    localDbName: localDbName.value
  }

  try {
    const saved = await store.saveProfile(profileData)
    store.notify('success', `Profile "${name.value}" saved!`)
    store.setActiveProfile(saved.id)
  } catch (err) {
    store.notify('error', `Save failed: ${err.message}`)
  }
}
</script>

<template>
  <div class="h-full flex flex-col bg-gray-50">
    <!-- Header -->
    <header class="px-5 py-3 border-b border-gray-200 bg-white flex items-center justify-between shrink-0 z-10">
      <div class="flex items-center gap-3">
        <button @click="store.goBack" class="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors">
          <ArrowLeft class="w-4 h-4" />
        </button>
        <h2 class="text-sm font-bold text-gray-800  tracking-wide">
          {{ props.profile ? 'Edit Connection Profile' : 'New Connection Profile' }}
        </h2>
      </div>
    </header>

    <div class="flex-1 overflow-y-auto bg-white p-6 md:p-8">
      <div class="w-full">

      <!-- Form Body -->
      <div class="grid grid-cols-1 xl:grid-cols-2 gap-x-16 gap-y-0">
        
        <!-- ================= LEFT COLUMN ================= -->
        <div>
          <!-- General Settings -->
          <section class="pb-8 mb-8 border-b border-gray-200">
            <h3 class="text-[11px] font-bold text-gray-500  tracking-wider mb-5 flex items-center gap-2">
              <Database class="w-3.5 h-3.5" />
              <span>General</span>
            </h3>
            <div class="grid grid-cols-2 gap-5">
              <div>
                <label class="block text-[11px] font-bold text-gray-700 mb-1.5 ">Profile Name *</label>
                <input
                  v-model="name"
                  type="text"
                  placeholder="e.g. OLSHOP ERP Staging"
                  class="form-input w-full"
                />
              </div>
              <div>
                <label class="block text-[11px] font-bold text-gray-700 mb-1.5 ">Database Type *</label>
                <select v-model="dbType" class="form-input w-full">
                  <option value="mysql">MySQL / MariaDB</option>
                  <option value="postgresql">PostgreSQL</option>
                </select>
              </div>
            </div>
          </section>

          <!-- SSH Tunnel Settings -->
          <section class="pb-8 mb-8 xl:mb-0 xl:border-b-0 border-b border-gray-200">
            <h3 class="text-[11px] font-bold text-gray-500  tracking-wider mb-5 flex items-center gap-2">
              <ShieldCheck class="w-3.5 h-3.5" />
              <span>SSH Configuration</span>
            </h3>
            <div class="grid grid-cols-3 gap-5 mb-5">
              <div class="col-span-2">
                <label class="block text-[11px] font-bold text-gray-700 mb-1.5 ">SSH Host *</label>
                <input
                  v-model="sshHost"
                  type="text"
                  placeholder="123.45.67.89 or example.com"
                  class="form-input w-full"
                />
              </div>
              <div>
                <label class="block text-[11px] font-bold text-gray-700 mb-1.5 ">SSH Port *</label>
                <input v-model="sshPort" type="number" class="form-input w-full" />
              </div>
            </div>

            <div class="grid grid-cols-2 gap-5 mb-5">
              <div>
                <label class="block text-[11px] font-bold text-gray-700 mb-1.5 ">SSH Username *</label>
                <input
                  v-model="sshUsername"
                  type="text"
                  placeholder="ubuntu, root, etc."
                  class="form-input w-full"
                />
              </div>
              <div>
                <label class="block text-[11px] font-bold text-gray-700 mb-1.5 ">Auth Method *</label>
                <select v-model="authMethod" class="form-input w-full">
                  <option value="key">SSH Key (No Password)</option>
                  <option value="key-passphrase">SSH Key + Passphrase</option>
                  <option value="password">Password</option>
                  <option value="agent">SSH Agent</option>
                  <option value="keyboard-interactive">Keyboard Interactive / 2FA</option>
                </select>
              </div>
            </div>

            <!-- Dynamic Auth Fields -->
            <div class="p-4 bg-gray-50 rounded border border-gray-200 space-y-4">
              <!-- Key / Key + Passphrase -->
              <div v-if="authMethod === 'key' || authMethod === 'key-passphrase'" class="space-y-4">
                <div>
                  <label class="block text-[11px] font-bold text-gray-700 mb-1.5 ">Private Key Path *</label>
                  <div class="flex gap-2">
                    <input
                      v-model="keyPath"
                      type="text"
                      placeholder="/home/user/.ssh/id_rsa"
                      class="form-input flex-1 bg-white"
                      readonly
                    />
                    <button @click="selectKeyFile" class="btn-secondary whitespace-nowrap bg-white">
                      Browse
                    </button>
                  </div>
                </div>
                <div v-if="authMethod === 'key-passphrase'">
                  <label class="block text-[11px] font-bold text-gray-700 mb-1.5 ">Key Passphrase</label>
                  <input
                    v-model="passphrase"
                    type="password"
                    placeholder="Passphrase for the key"
                    class="form-input w-full bg-white"
                  />
                </div>
              </div>

              <!-- Password / Keyboard Interactive -->
              <div v-if="authMethod === 'password' || authMethod === 'keyboard-interactive'">
                <label class="block text-[11px] font-bold text-gray-700 mb-1.5 ">SSH Password *</label>
                <input
                  v-model="sshPassword"
                  type="password"
                  placeholder="Remote SSH user password"
                  class="form-input w-full bg-white"
                />
              </div>

              <!-- SSH Agent -->
              <div v-if="authMethod === 'agent'" class="text-xs text-gray-500">
                Uses active system SSH agent session (requires
                <code class="bg-white border border-gray-200 px-1 py-0.5 rounded text-gray-800 font-mono text-[10px]">SSH_AUTH_SOCK</code>
                environment variable).
              </div>
            </div>
          </section>
        </div>

        <!-- ================= RIGHT COLUMN ================= -->
        <div>
          <!-- Remote DB Settings -->
          <section class="pb-8 mb-8 border-b border-gray-200">
            <h3 class="text-[11px] font-bold text-gray-500  tracking-wider mb-5 flex items-center gap-2">
              <Server class="w-3.5 h-3.5" />
              <span>Remote Database Configuration</span>
            </h3>
            <div class="grid grid-cols-3 gap-5 mb-5">
              <div class="col-span-2">
                <label class="block text-[11px] font-bold text-gray-700 mb-1.5 "
                  >Database Host (relative to server) *</label
                >
                <input
                  v-model="dbHost"
                  type="text"
                  placeholder="localhost (usually)"
                  class="form-input w-full"
                />
              </div>
              <div>
                <label class="block text-[11px] font-bold text-gray-700 mb-1.5 ">Database Port *</label>
                <input v-model="dbPort" type="number" class="form-input w-full" />
              </div>
            </div>

            <div class="grid grid-cols-3 gap-5">
              <div>
                <label class="block text-[11px] font-bold text-gray-700 mb-1.5 ">Database User *</label>
                <input v-model="dbUser" type="text" class="form-input w-full" />
              </div>
              <div class="col-span-2">
                <label class="block text-[11px] font-bold text-gray-700 mb-1.5 ">Database Password</label>
                <input
                  v-model="dbPassword"
                  type="password"
                  placeholder="DB password"
                  class="form-input w-full"
                />
              </div>
              <div class="col-span-3 mt-1">
                <label class="block text-[11px] font-bold text-gray-700 mb-1.5 ">Database Name *</label>
                <input
                  v-model="dbName"
                  type="text"
                  placeholder="Name of database"
                  class="form-input w-full"
                />
              </div>
            </div>
          </section>

          <!-- Local DB Settings -->
          <section class="pb-8 mb-8">
            <h3 class="text-[11px] font-bold text-gray-500  tracking-wider mb-5 flex items-center gap-2">
              <Database class="w-3.5 h-3.5" />
              <span>Local Destination Configuration</span>
            </h3>
            <div class="grid grid-cols-3 gap-5 mb-5">
              <div class="col-span-2">
                <label class="block text-[11px] font-bold text-gray-700 mb-1.5 ">Local Database Host *</label>
                <input v-model="localDbHost" type="text" placeholder="127.0.0.1" class="form-input w-full" />
              </div>
              <div>
                <label class="block text-[11px] font-bold text-gray-700 mb-1.5 ">Local Port *</label>
                <input v-model="localDbPort" type="number" class="form-input w-full" />
              </div>
            </div>

            <div class="grid grid-cols-3 gap-5">
              <div>
                <label class="block text-[11px] font-bold text-gray-700 mb-1.5 ">Local User *</label>
                <input v-model="localDbUser" type="text" class="form-input w-full" />
              </div>
              <div class="col-span-2">
                <label class="block text-[11px] font-bold text-gray-700 mb-1.5 ">Local Password</label>
                <input
                  v-model="localDbPassword"
                  type="password"
                  placeholder="Local DB password"
                  class="form-input w-full"
                />
              </div>
              <div class="col-span-3 mt-1">
                <label class="block text-[11px] font-bold text-gray-700 mb-1.5 ">Local DB Name *</label>
                <input
                  v-model="localDbName"
                  type="text"
                  placeholder="Local DB name"
                  class="form-input w-full"
                />
              </div>
            </div>
          </section>
        </div>
      </div>

      <!-- Actions Footer -->
      <div class="flex items-center justify-between pt-6 mt-4 border-t border-gray-200">
        <div class="flex gap-3">
          <button @click="testSsh" :disabled="isTestingSsh" class="btn-secondary">
            <RefreshCw class="w-4 h-4 animate-spin" v-if="isTestingSsh" />
            <span>Test SSH</span>
          </button>
          <button @click="testFullConnection" :disabled="isTestingFull" class="btn-secondary">
            <RefreshCw class="w-4 h-4 animate-spin" v-if="isTestingFull" />
            <span>Test Connection</span>
          </button>
        </div>

        <div class="flex gap-3">
          <button @click="store.goBack" class="btn-secondary">Cancel</button>
          <button @click="save" class="btn-primary">Save Profile</button>
        </div>
      </div>
      </div>
    </div>
  </div>
</template>

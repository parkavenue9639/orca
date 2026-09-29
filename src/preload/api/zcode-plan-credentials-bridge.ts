import { ipcRenderer } from 'electron'
import type { PreloadApi } from '../api-types'

export const zcodePlanCredentialsApi = {
  getStatus: (): Promise<{
    apiKeyConfigured: boolean
    zcodeCliConfigured: boolean
  }> => ipcRenderer.invoke('zcodePlanCredentials:getStatus'),
  saveApiKey: (key: string): Promise<{ apiKeyConfigured: boolean }> =>
    ipcRenderer.invoke('zcodePlanCredentials:saveApiKey', key),
  clearApiKey: (): Promise<{ apiKeyConfigured: boolean }> =>
    ipcRenderer.invoke('zcodePlanCredentials:clearApiKey')
} satisfies PreloadApi['zcodePlanCredentials']

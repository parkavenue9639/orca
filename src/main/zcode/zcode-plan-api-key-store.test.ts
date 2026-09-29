import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ZcodePlanApiKeyStore from './zcode-plan-api-key-store'

const safeStorageMock = vi.hoisted(() => ({
  isEncryptionAvailable: vi.fn(() => true),
  encryptString: vi.fn((value: string) => Buffer.from(value)),
  decryptString: vi.fn((value: Buffer) => value.toString('utf8'))
}))

const electronMock = vi.hoisted(() => ({
  safeStorage: safeStorageMock
}))

vi.mock('electron', () => electronMock)

const existsSyncMock = vi.fn()
const readFileSyncMock = vi.fn()
const rmSyncMock = vi.fn()
const hardenExistingSecureFileMock = vi.fn()
const writeSecureFileMock = vi.fn()
const homedirMock = vi.fn(() => '/home/test')

vi.mock('node:fs', () => ({
  existsSync: existsSyncMock,
  readFileSync: readFileSyncMock,
  rmSync: rmSyncMock
}))

vi.mock('node:os', () => ({
  homedir: homedirMock
}))

vi.mock('node:path', () => ({
  join: (...parts: string[]) => parts.join('/')
}))

vi.mock('../../shared/secure-file', () => ({
  hardenExistingSecureFile: hardenExistingSecureFileMock,
  writeSecureFile: writeSecureFileMock
}))

const storePath = '/home/test/.orca/zcode-plan-api-key.enc'
const envelope = (kind: 'encrypted' | 'plaintext', value: string): string =>
  `orca-zcode-plan-api-key:v1:${kind}:${Buffer.from(value, 'utf8').toString('base64')}`

async function loadStore(): Promise<typeof ZcodePlanApiKeyStore> {
  return await import('./zcode-plan-api-key-store')
}

describe('zcode-plan-api-key-store', () => {
  beforeEach(() => {
    existsSyncMock.mockReset()
    readFileSyncMock.mockReset()
    rmSyncMock.mockReset()
    hardenExistingSecureFileMock.mockReset()
    writeSecureFileMock.mockReset()
    safeStorageMock.isEncryptionAvailable.mockReset()
    safeStorageMock.encryptString.mockReset()
    safeStorageMock.decryptString.mockReset()
    safeStorageMock.isEncryptionAvailable.mockReturnValue(true)
    safeStorageMock.encryptString.mockImplementation((value: string) => Buffer.from(value))
    safeStorageMock.decryptString.mockImplementation((value: Buffer) => value.toString('utf8'))
    homedirMock.mockReturnValue('/home/test')
    vi.resetModules()
  })

  it('reports unconfigured while no key file exists', async () => {
    existsSyncMock.mockReturnValue(false)
    const store = await loadStore()

    expect(store.hasZcodePlanApiKey()).toBe(false)
    expect(store.readZcodePlanApiKey()).toBeNull()
  })

  it('saves an encrypted envelope and reads it back through the cache', async () => {
    existsSyncMock.mockReturnValue(false)
    const store = await loadStore()

    store.saveZcodePlanApiKey(' glm-secret ')

    expect(writeSecureFileMock).toHaveBeenCalledWith(storePath, envelope('encrypted', 'glm-secret'))
    existsSyncMock.mockReturnValue(true)
    readFileSyncMock.mockReturnValue(Buffer.from(envelope('encrypted', 'glm-secret')))
    expect(store.hasZcodePlanApiKey()).toBe(true)
    expect(store.readZcodePlanApiKey()).toBe('glm-secret')
  })

  it('warns and writes plaintext when safeStorage is unavailable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    safeStorageMock.isEncryptionAvailable.mockReturnValue(false)
    existsSyncMock.mockReturnValue(false)
    const store = await loadStore()

    store.saveZcodePlanApiKey('glm-secret')

    expect(writeSecureFileMock).toHaveBeenCalledWith(storePath, envelope('plaintext', 'glm-secret'))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('safeStorage encryption unavailable'))
    warn.mockRestore()
  })

  it('reads a plaintext envelope back without requiring safeStorage', async () => {
    safeStorageMock.isEncryptionAvailable.mockReturnValue(false)
    existsSyncMock.mockReturnValue(true)
    readFileSyncMock.mockReturnValue(Buffer.from(envelope('plaintext', 'glm-secret')))
    const store = await loadStore()

    expect(store.readZcodePlanApiKey()).toBe('glm-secret')
    expect(safeStorageMock.decryptString).not.toHaveBeenCalled()
  })

  it('rejects saving an empty key', async () => {
    const store = await loadStore()

    expect(() => store.saveZcodePlanApiKey('   ')).toThrow('GLM Coding Plan API key is required')
    expect(writeSecureFileMock).not.toHaveBeenCalled()
  })

  it('refuses to decrypt an encrypted envelope once safeStorage becomes unavailable', async () => {
    safeStorageMock.isEncryptionAvailable.mockReturnValue(false)
    existsSyncMock.mockReturnValue(true)
    readFileSyncMock.mockReturnValue(Buffer.from(envelope('encrypted', 'glm-secret')))
    const store = await loadStore()

    expect(() => store.readZcodePlanApiKey()).toThrow('could not be decrypted')
  })

  it('throws on an unreadable envelope instead of returning a partial key', async () => {
    existsSyncMock.mockReturnValue(true)
    readFileSyncMock.mockReturnValue(Buffer.from('not-an-envelope'))
    const store = await loadStore()

    expect(() => store.readZcodePlanApiKey()).toThrow('could not be decrypted')
  })

  it('clearing removes the file and resets the cached value', async () => {
    existsSyncMock.mockReturnValue(false)
    const store = await loadStore()
    store.saveZcodePlanApiKey('glm-secret')

    existsSyncMock.mockReturnValue(true)
    store.clearZcodePlanApiKey()

    expect(rmSyncMock).toHaveBeenCalledWith(storePath, { force: true })
    existsSyncMock.mockReturnValue(false)
    expect(store.readZcodePlanApiKey()).toBeNull()
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

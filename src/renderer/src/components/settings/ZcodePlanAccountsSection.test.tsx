// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getStatus: vi.fn(),
  saveApiKey: vi.fn(),
  clearApiKey: vi.fn(),
  refreshRateLimits: vi.fn(),
  updateSettings: vi.fn(),
  recordFeatureInteraction: vi.fn(),
  zcodeUsage: vi.fn<() => unknown>(() => null),
  settings: {
    zcodePlanSite: 'zai' as 'zai' | 'bigmodel'
  }
}))

vi.mock('@/lib/agent-catalog', () => ({
  AgentIcon: () => React.createElement('span', { 'data-testid': 'zcode-icon' })
}))

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: Record<string, string>) => {
    let result = fallback
    for (const [key, value] of Object.entries(values ?? {})) {
      result = result.replace(`{{${key}}}`, value)
    }
    return result
  }
}))

vi.mock('../../store', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      refreshRateLimits: mocks.refreshRateLimits,
      updateSettings: mocks.updateSettings,
      recordFeatureInteraction: mocks.recordFeatureInteraction,
      settingsSearchQuery: '',
      settings: mocks.settings,
      rateLimits: { zcode: mocks.zcodeUsage() }
    })
}))

import { ZcodePlanAccountsSection } from './ZcodePlanAccountsSection'

describe('ZcodePlanAccountsSection', () => {
  beforeEach(() => {
    mocks.getStatus.mockResolvedValue({ apiKeyConfigured: false, zcodeCliConfigured: false })
    mocks.saveApiKey.mockResolvedValue({ apiKeyConfigured: true })
    mocks.clearApiKey.mockResolvedValue({ apiKeyConfigured: false })
    mocks.refreshRateLimits.mockResolvedValue(undefined)
    mocks.updateSettings.mockResolvedValue(undefined)
    mocks.recordFeatureInteraction.mockReset()
    mocks.zcodeUsage.mockReturnValue(null)
    mocks.settings.zcodePlanSite = 'zai'
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        zcodePlanCredentials: {
          getStatus: mocks.getStatus,
          saveApiKey: mocks.saveApiKey,
          clearApiKey: mocks.clearApiKey
        }
      }
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('shows the unlinked state when neither an API key nor a CLI config exists', async () => {
    render(<ZcodePlanAccountsSection />)

    expect(await screen.findByText('No GLM Coding Plan linked')).toBeInTheDocument()
    expect(screen.queryByText('Using the ZCode CLI sign-in')).not.toBeInTheDocument()
  })

  it('explains the CLI fallback when only the ZCode CLI config exists', async () => {
    mocks.getStatus.mockResolvedValue({ apiKeyConfigured: false, zcodeCliConfigured: true })

    render(<ZcodePlanAccountsSection />)

    expect(await screen.findByText('Using the ZCode CLI sign-in')).toBeInTheDocument()
    expect(screen.getByText(/~\/\.zcode\/cli\/config\.json/)).toBeInTheDocument()
  })

  it('saves a trimmed API key through the credential IPC', async () => {
    render(<ZcodePlanAccountsSection />)

    const input = await screen.findByPlaceholderText('Paste your GLM Coding Plan API key')
    fireEvent.change(input, { target: { value: '  glm-secret  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(mocks.saveApiKey).toHaveBeenCalledWith('glm-secret')
    })
    expect(mocks.recordFeatureInteraction).toHaveBeenCalledWith('usage-tracking')
    await screen.findByText('Replace')
  })

  it('requires a non-empty key before saving', async () => {
    render(<ZcodePlanAccountsSection />)

    const save = await screen.findByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
  })

  it('forgets a saved key through the credential IPC', async () => {
    mocks.getStatus.mockResolvedValue({ apiKeyConfigured: true, zcodeCliConfigured: true })

    render(<ZcodePlanAccountsSection />)

    fireEvent.click(await screen.findByRole('button', { name: 'Forget key' }))

    await waitFor(() => {
      expect(mocks.clearApiKey).toHaveBeenCalledTimes(1)
    })
    expect(mocks.recordFeatureInteraction).toHaveBeenCalledWith('usage-tracking')
  })

  it('labels the saved state with the selected site', async () => {
    mocks.getStatus.mockResolvedValue({ apiKeyConfigured: true, zcodeCliConfigured: false })
    mocks.settings.zcodePlanSite = 'bigmodel'

    render(<ZcodePlanAccountsSection />)

    expect(
      await screen.findByText('API key saved · Zhipu · BigModel (open.bigmodel.cn)')
    ).toBeInTheDocument()
  })

  it('renders the live quota windows for a linked plan', async () => {
    mocks.getStatus.mockResolvedValue({ apiKeyConfigured: true, zcodeCliConfigured: false })
    mocks.zcodeUsage.mockReturnValue({
      provider: 'zcode',
      status: 'ok',
      error: null,
      planType: 'max',
      session: { usedPercent: 42, windowMinutes: 300, resetsAt: null, resetDescription: null },
      weekly: { usedPercent: 73, windowMinutes: 10080, resetsAt: null, resetDescription: null },
      monthly: null,
      updatedAt: Date.now()
    })

    render(<ZcodePlanAccountsSection />)

    expect(await screen.findByText('42%')).toBeInTheDocument()
    expect(screen.getByText('73%')).toBeInTheDocument()
    expect(screen.getByText('Plan: max')).toBeInTheDocument()
  })
})

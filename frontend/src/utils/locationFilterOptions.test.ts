import { expect, it } from 'vitest'
import { changeDealFilter } from './changeDealFilter'
import { locationFilterOptions } from './locationFilterOptions'
import { isLocationOptions } from '../api/isLocationOptions'
import { mockDeals } from '../data/mockDeals'
import type { DealFilters } from './filterDeals'

const catalog = { scope: { city: 'חיפה', neighborhood: 'הדר' }, cities: ['חיפה', 'תל אביב'],
  neighborhoods: ['הדר', 'כרמל'], streets: ['הרצל', 'בלפור'] }

it('clears descendants atomically on parent changes while preserving unrelated filters and originals', () => {
  const filters: DealFilters = { city: 'חיפה', neighborhood: 'הדר', street: 'הרצל', rooms: '4', has_parking: 'true' }
  expect(changeDealFilter(filters, 'city', 'תל אביב')).toEqual({ city: 'תל אביב', rooms: '4', has_parking: 'true' })
  expect(changeDealFilter(filters, 'city', '')).toEqual({ city: '', rooms: '4', has_parking: 'true' })
  expect(changeDealFilter(filters, 'neighborhood', 'כרמל')).toEqual({ ...filters, neighborhood: 'כרמל', street: undefined })
  expect(changeDealFilter(filters, 'neighborhood', '')).toEqual({ ...filters, neighborhood: '', street: undefined })
  expect(changeDealFilter(filters, 'city', 'חיפה')).toEqual(filters)
  expect(changeDealFilter(filters, 'street', 'בלפור')).toEqual({ ...filters, street: 'בלפור' })
  expect(filters.street).toBe('הרצל')
})

it('uses complete choices and suppresses only the stale descendants during a parent transition', () => {
  const options = locationFilterOptions([], { city: 'חיפה', neighborhood: 'הדר', street: 'הרצל' }, catalog)
  expect(options.city.options).toEqual(['חיפה', 'תל אביב'])
  expect(options.neighborhood.options).toEqual(['הדר', 'כרמל'])
  expect(options.street.options).toEqual(['הרצל', 'בלפור'])
  const changedCity = locationFilterOptions(mockDeals, { city: 'תל אביב' }, catalog)
  expect(changedCity.city.disabled).toBe(false)
  expect(changedCity.neighborhood).toEqual({ options: [], disabled: true })
  expect(changedCity.street).toEqual({ options: [], disabled: true })
  const changedNeighborhood = locationFilterOptions(mockDeals, { city: 'חיפה', neighborhood: 'כרמל' }, catalog)
  expect(changedNeighborhood.neighborhood.disabled).toBe(false)
  expect(changedNeighborhood.street.disabled).toBe(true)
  expect(locationFilterOptions([], { city: 'חיפה' }, { ...catalog, scope: { city: 'חיפה', neighborhood: null } }).street.disabled).toBe(false)
  expect(locationFilterOptions(mockDeals, {}).city.options).toHaveLength(4)
})

it.each([
  null, [], {}, { ...catalog, scope: null }, { ...catalog, scope: { city: '', neighborhood: null } },
  { ...catalog, cities: null }, { ...catalog, cities: ['חיפה', 'חיפה'] }, { ...catalog, neighborhoods: [''] },
])('rejects malformed location metadata %j', (data) => { expect(isLocationOptions(data)).toBe(false) })

it('accepts valid metadata including a global scope and empty options', () => {
  expect(isLocationOptions(catalog)).toBe(true)
  expect(isLocationOptions({ scope: { city: null, neighborhood: null }, cities: [], neighborhoods: [], streets: [] })).toBe(true)
})

it('requires a selected city for neighborhoods even with global metadata or legacy page-based options', () => {
  expect(locationFilterOptions(mockDeals, {}).neighborhood).toEqual({ options: [], disabled: true })
  expect(locationFilterOptions(mockDeals, {}, { ...catalog, scope: { city: null, neighborhood: null } }).neighborhood)
    .toEqual({ options: [], disabled: true })
  expect(locationFilterOptions(mockDeals, { city: 'חיפה' }).neighborhood.disabled).toBe(false)
})

it('keeps a preselected city alias selected without adding a duplicate option', () => {
  const result = locationFilterOptions([], { city: 'ת"א' }, {
    scope: { city: 'ת"א', neighborhood: null }, selected_city: 'תל אביב-יפו',
    cities: ['תל אביב-יפו'], neighborhoods: ['מרכז'], streets: ['הרצל'],
  })
  expect(result.city.options).toEqual(['תל אביב-יפו'])
  expect(result.city.value).toBe('תל אביב-יפו')
  expect(result.neighborhood.disabled).toBe(false)
  expect(locationFilterOptions([], { city: 'חיפה' }, {
    scope: { city: 'ת"א', neighborhood: null }, selected_city: 'תל אביב-יפו',
    cities: ['חיפה', 'תל אביב-יפו'], neighborhoods: [], streets: [],
  }).city.value).toBe('חיפה')
  expect(isLocationOptions({ ...catalog, selected_city: 5 })).toBe(false)
  expect(isLocationOptions({ ...catalog, selected_city: null })).toBe(true)
})

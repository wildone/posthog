import { kea } from 'kea'
import api from 'lib/api'
import { cohortsModel } from '~/models/cohortsModel'
import { ENTITY_MATCH_TYPE, FEATURE_FLAGS, PROPERTY_MATCH_TYPE } from 'lib/constants'
import { cohortLogicType } from './cohortLogicType'
import {
    AnyCohortCriteriaType,
    AnyCohortGroupType,
    Breadcrumb,
    CohortCriteriaGroupFilter,
    CohortGroupType,
    CohortType,
    FilterLogicalOperator,
} from '~/types'
import { personsLogic } from 'scenes/persons/personsLogic'
import { lemonToast } from 'lib/components/lemonToast'
import { urls } from 'scenes/urls'
import { router } from 'kea-router'
import { featureFlagLogic } from 'lib/logic/featureFlagLogic'
import {
    applyAllCriteriaGroup,
    applyAllNestedCriteria,
    cleanCriteria,
    createCohortFormData,
    isCohortCriteriaGroup,
    NEW_COHORT,
    NEW_CRITERIA,
    NEW_CRITERIA_GROUP,
    processCohortOnSet,
    validateGroup,
} from 'scenes/cohorts/cohortUtils'

export interface CohortLogicProps {
    id?: CohortType['id']
}

export const cohortLogic = kea<cohortLogicType<CohortLogicProps>>({
    props: {} as CohortLogicProps,
    key: (props) => props.id || 'new',
    path: (key) => ['scenes', 'cohorts', 'cohortLogic', key],

    actions: () => ({
        saveCohort: (cohortParams = {}) => ({ cohortParams }),
        setCohort: (cohort: CohortType) => ({ cohort }),
        deleteCohort: true,
        fetchCohort: (id: CohortType['id']) => ({ id }),
        onCriteriaChange: (newGroup: Partial<CohortGroupType>, id: string) => ({ newGroup, id }),
        setPollTimeout: (pollTimeout: NodeJS.Timeout | null) => ({ pollTimeout }),
        checkIfFinishedCalculating: (cohort: CohortType) => ({ cohort }),

        setOuterGroupsType: (type: FilterLogicalOperator) => ({ type }),
        setInnerGroupType: (type: FilterLogicalOperator, groupIndex: number) => ({ type, groupIndex }),
        duplicateFilter: (groupIndex: number, criteriaIndex?: number) => ({ groupIndex, criteriaIndex }),
        addFilter: (groupIndex?: number) => ({ groupIndex }),
        removeFilter: (groupIndex: number, criteriaIndex?: number) => ({ groupIndex, criteriaIndex }),
        setCriteria: (newCriteria: AnyCohortCriteriaType, groupIndex: number, criteriaIndex: number) => ({
            newCriteria,
            groupIndex,
            criteriaIndex,
        }),
    }),

    reducers: () => ({
        cohort: [
            NEW_COHORT as CohortType,
            {
                onCriteriaChange: (state, { newGroup, id }) => {
                    const cohort = { ...state }
                    const index = cohort.groups.findIndex((group: AnyCohortGroupType) => group.id === id)
                    if (newGroup.matchType) {
                        cohort.groups[index] = {
                            id: cohort.groups[index].id,
                            matchType: ENTITY_MATCH_TYPE,
                            ...newGroup,
                        }
                    } else {
                        cohort.groups[index] = {
                            ...cohort.groups[index],
                            ...newGroup,
                        }
                    }
                    return processCohortOnSet(cohort)
                },
                setOuterGroupsType: (state, { type }) => ({
                    ...state,
                    filters: {
                        properties: {
                            ...state.filters.properties,
                            type,
                        },
                    },
                }),
                setInnerGroupType: (state, { type, groupIndex }) => applyAllCriteriaGroup(state,(groupList) =>
                    groupList.map((group, groupI) =>
                        groupI === groupIndex
                            ? {...group, type}
                            : group
                    ) as CohortCriteriaGroupFilter[]
                ),
                duplicateFilter: (state, { groupIndex, criteriaIndex }) => {
                    if (criteriaIndex !== undefined) {
                        return applyAllNestedCriteria(state, groupIndex, (criteriaList) =>
                            [
                                ...criteriaList.slice(0, criteriaIndex),
                                criteriaList[criteriaIndex],
                                ...criteriaList.slice(criteriaIndex),
                            ]
                        )
                    }
                    return applyAllCriteriaGroup(state, (groupList) =>
                        [
                            ...groupList.slice(0, groupIndex),
                            groupList[groupIndex],
                            ...groupList.slice(groupIndex),
                        ]
                    )
                },
                addFilter: (state, { groupIndex }) => {
                    if (groupIndex !== undefined) {
                        return applyAllNestedCriteria(state, groupIndex, (criteriaList) =>
                            [...criteriaList, NEW_CRITERIA]
                        )
                    }
                    return applyAllCriteriaGroup(state, (groupList) =>
                        [...groupList, NEW_CRITERIA_GROUP]
                    )
                },
                removeFilter: (state, { groupIndex, criteriaIndex }) => {
                    if (criteriaIndex !== undefined) {
                        return applyAllNestedCriteria(state, groupIndex, (criteriaList) =>
                            [...criteriaList.slice(0, criteriaIndex), ...criteriaList.slice(criteriaIndex + 1)]
                        )
                    }
                    return applyAllCriteriaGroup(state, (groupList) =>
                        [
                            ...groupList.slice(0, groupIndex),
                            ...groupList.slice(groupIndex + 1),
                        ]
                    )
                },
                setCriteria: (state, {newCriteria, groupIndex, criteriaIndex}) => {
                    return applyAllNestedCriteria(state, groupIndex, (criteriaList) => criteriaList.map((oldCriteria, criteriaI) =>
                        isCohortCriteriaGroup(oldCriteria)
                            ? oldCriteria
                            : criteriaI === criteriaIndex
                                ? cleanCriteria({...oldCriteria, ...newCriteria})
                                : oldCriteria
                    ))
                },
            },
        ],
        pollTimeout: [
            null as NodeJS.Timeout | null,
            {
                setPollTimeout: (_, { pollTimeout }) => pollTimeout,
            },
        ],
    }),

    forms: ({ actions, values }) => ({
        cohort: {
            defaults: NEW_COHORT,
            validator: ({ name, csv, is_static, groups, filters }) => ({
                name: !name ? 'You need to set a name' : undefined,
                csv: is_static && !csv ? 'You need to upload a CSV file' : (null as any),
                ...(values.newCohortFiltersEnabled
                    ? {
                          filters: {
                              properties: {
                                  values: filters.properties.values.map(validateGroup),
                              },
                          },
                      }
                    : {
                          groups: is_static
                              ? undefined
                              : !groups || groups.length < 1
                              ? [{ id: 'You need at least one matching group' }]
                              : groups?.map(({ matchType, properties, action_id, event_id }) => {
                                    if (matchType === PROPERTY_MATCH_TYPE && !properties?.length) {
                                        return { id: 'Please select at least one property or remove this match group.' }
                                    }
                                    if (matchType === ENTITY_MATCH_TYPE && !(action_id || event_id)) {
                                        return { id: 'Please select an event or action.' }
                                    }
                                    return { id: undefined }
                                }),
                      }),
            }),
            submit: (cohort) => {
                actions.saveCohort(cohort)
            },
        },
    }),

    loaders: ({ actions, values, key }) => ({
        cohort: [
            NEW_COHORT as CohortType,
            {
                setCohort: ({ cohort }) => {
                    return processCohortOnSet(cohort)
                },
                fetchCohort: async ({ id }, breakpoint) => {
                    try {
                        const cohort = await api.cohorts.get(id)
                        breakpoint()
                        cohortsModel.actions.updateCohort(cohort)
                        actions.checkIfFinishedCalculating(cohort)
                        return processCohortOnSet(cohort)
                    } catch (error: any) {
                        lemonToast.error(error.detail || 'Failed to fetch cohort')
                        return values.cohort
                    }
                },
                saveCohort: async ({ cohortParams }, breakpoint) => {
                    let cohort = { ...cohortParams }
                    const cohortFormData = createCohortFormData(cohort, values.newCohortFiltersEnabled)

                    try {
                        if (cohort.id !== 'new') {
                            cohort = await api.cohorts.update(cohort.id, cohortFormData as Partial<CohortType>)
                            cohortsModel.actions.updateCohort(cohort)
                        } else {
                            cohort = await api.cohorts.create(cohortFormData as Partial<CohortType>)
                            cohortsModel.actions.cohortCreated(cohort)
                        }
                    } catch (error: any) {
                        lemonToast.error(error.detail || 'Failed to save cohort')
                        return values.cohort
                    }

                    cohort.is_calculating = true // this will ensure there is always a polling period to allow for backend calculation task to run
                    breakpoint()
                    delete cohort['csv']
                    actions.setCohort(cohort)
                    lemonToast.success('Cohort saved. Please wait up to a few minutes for it to be calculated', {
                        toastId: `cohort-saved-${key}`,
                    })
                    actions.checkIfFinishedCalculating(cohort)
                    return cohort
                },
            },
        ],
    }),

    selectors: {
        newCohortFiltersEnabled: [
            () => [featureFlagLogic.selectors.featureFlags],
            (featureFlags) => !!featureFlags[FEATURE_FLAGS.COHORT_FILTERS],
        ],
        breadcrumbs: [
            (s) => [s.cohort],
            (cohort): Breadcrumb[] => [
                {
                    name: 'Cohorts',
                    path: urls.cohorts(),
                },
                ...(cohort ? [{ name: cohort.name || 'Untitled' }] : []),
            ],
        ],
    },

    listeners: ({ actions, values }) => ({
        deleteCohort: () => {
            cohortsModel.findMounted()?.actions.deleteCohort(values.cohort)
            router.actions.push(urls.cohorts())
        },
        checkIfFinishedCalculating: async ({ cohort }, breakpoint) => {
            if (cohort.is_calculating) {
                actions.setPollTimeout(
                    setTimeout(async () => {
                        const newCohort = await api.cohorts.get(cohort.id)
                        breakpoint()
                        actions.checkIfFinishedCalculating(newCohort)
                    }, 1000)
                )
            } else {
                actions.setCohort(cohort)
                cohortsModel.actions.updateCohort(cohort)
                personsLogic.findMounted({ syncWithUrl: true })?.actions.loadCohorts() // To ensure sync on person page
                if (values.pollTimeout) {
                    clearTimeout(values.pollTimeout)
                    actions.setPollTimeout(null)
                }
            }
        },
    }),

    actionToUrl: ({ values }) => ({
        saveCohortSuccess: () => urls.cohort(values.cohort.id),
    }),

    events: ({ values, actions, props }) => ({
        afterMount: async () => {
            if (!props.id || props.id === 'new') {
                actions.setCohort(NEW_COHORT)
            } else {
                actions.fetchCohort(props.id)
            }
        },
        beforeUnmount: () => {
            if (values.pollTimeout) {
                clearTimeout(values.pollTimeout)
            }
        },
    }),
})

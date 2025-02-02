import { FunnelStepReference, FunnelStepWithConversionMetrics } from '~/types'
import { useActions, useValues } from 'kea'
import { insightLogic } from 'scenes/insights/insightLogic'
import { funnelLogic } from 'scenes/funnels/funnelLogic'
import {
    formatDisplayPercentage,
    getBreakdownStepValues,
    getReferenceStep,
    humanizeOrder,
    humanizeStepCount,
} from 'scenes/funnels/funnelUtils'
import React, { useRef } from 'react'
import useSize from '@react-hook/size'
import { clamp, humanFriendlyDuration, pluralize } from 'lib/utils'
import { Popover } from 'antd'
import { LEGACY_InsightTooltip } from 'scenes/insights/InsightTooltip/LEGACY_InsightTooltip'
import { PropertyKeyInfo } from 'lib/components/PropertyKeyInfo'
import { MetricRow } from 'scenes/funnels/FunnelBarGraph'
import { getSeriesColor } from 'lib/colors'

interface BreakdownBarGroupProps {
    currentStep: FunnelStepWithConversionMetrics
    previousStep: FunnelStepWithConversionMetrics
    showLabels: boolean
    onBarClick?: (breakdown_value: Omit<FunnelStepWithConversionMetrics, 'nested_breakdown'>) => void
    disabled: boolean
    aggregationTargetLabel: { singular: string; plural: string }
}

export function BreakdownVerticalBarGroup({
    currentStep,
    previousStep,
    showLabels,
    onBarClick,
    disabled,
    aggregationTargetLabel,
}: BreakdownBarGroupProps): JSX.Element {
    const ref = useRef<HTMLDivElement | null>(null)
    const [, height] = useSize(ref)
    const barWidth = `calc(${100 / (currentStep?.nested_breakdown?.length ?? 1)}% - 2px)`

    return (
        <div className="breakdown-bar-group" ref={ref}>
            {currentStep?.nested_breakdown?.map((breakdown, breakdownIndex) => {
                const currentBarHeight = clamp(height * breakdown.conversionRates.fromBasisStep, 0, height)
                const previousBarHeight = clamp(currentBarHeight / breakdown.conversionRates.fromBasisStep, 0, height)
                const color = getSeriesColor(breakdown.order ?? 0)
                const breakdownValues = getBreakdownStepValues(breakdown, breakdownIndex)

                const popoverMetrics = [
                    {
                        title: 'Completed step',
                        value: breakdown.count,
                    },
                    {
                        title: 'Conversion rate (total)',
                        value: formatDisplayPercentage(breakdown.conversionRates.total) + '%',
                    },
                    {
                        title: `Conversion rate (from step ${humanizeOrder(previousStep.order)})`,
                        value: formatDisplayPercentage(breakdown.conversionRates.fromPrevious) + '%',
                        visible: currentStep.order !== 0,
                    },
                    {
                        title: 'Dropped off',
                        value: breakdown.droppedOffFromPrevious,
                        visible: currentStep.order !== 0 && breakdown.droppedOffFromPrevious > 0,
                    },
                    {
                        title: `Dropoff rate (from step ${humanizeOrder(previousStep.order)})`,
                        value: formatDisplayPercentage(1 - breakdown.conversionRates.fromPrevious) + '%',
                        visible: currentStep.order !== 0 && breakdown.droppedOffFromPrevious > 0,
                    },
                    {
                        title: 'Average time on step',
                        value: humanFriendlyDuration(breakdown.average_conversion_time),
                        visible: !!breakdown.average_conversion_time,
                    },
                ]

                return (
                    <div
                        key={breakdownIndex}
                        className="breakdown-bar-column"
                        style={{
                            width: barWidth,
                        }}
                    >
                        {currentStep.order > 0 && (
                            <div
                                className="breakdown-previous-bar"
                                style={{
                                    height: previousBarHeight,
                                    backgroundColor: color,
                                    width: barWidth,
                                }}
                            />
                        )}
                        <Popover
                            trigger="hover"
                            placement="right"
                            content={
                                <LEGACY_InsightTooltip
                                    altTitle={
                                        <div style={{ wordWrap: 'break-word' }}>
                                            <PropertyKeyInfo value={currentStep.name} />
                                            {breakdownValues.breakdown_value?.[0] === 'Baseline'
                                                ? ''
                                                : ` • ${breakdownValues.breakdown.join(',')}`}
                                        </div>
                                    }
                                >
                                    {popoverMetrics.map(({ title, value, visible }, index) =>
                                        visible !== false ? <MetricRow key={index} title={title} value={value} /> : null
                                    )}
                                </LEGACY_InsightTooltip>
                            }
                        >
                            <div
                                className="breakdown-current-bar"
                                style={{
                                    height: currentBarHeight,
                                    backgroundColor: color,
                                    width: barWidth,
                                    cursor: disabled ? undefined : 'pointer',
                                }}
                                onClick={() => onBarClick && onBarClick(breakdown)}
                            />
                        </Popover>
                        {showLabels && (
                            <div
                                className="breakdown-label"
                                style={{
                                    bottom: currentBarHeight + 4,
                                    width: barWidth,
                                }}
                            >
                                {breakdown.count > 0
                                    ? `${humanizeStepCount(breakdown.count)} ${pluralize(
                                          breakdown.count,
                                          aggregationTargetLabel.singular,
                                          aggregationTargetLabel.plural,
                                          false
                                      )}`
                                    : ''}
                            </div>
                        )}
                    </div>
                )
            })}
        </div>
    )
}

export function BreakdownBarGroupWrapper({
    step,
    showLabels,
}: {
    step: FunnelStepWithConversionMetrics
    showLabels: boolean
}): JSX.Element {
    const { insightProps } = useValues(insightLogic)
    const logic = funnelLogic(insightProps)
    const { visibleStepsWithConversionMetrics: steps, isModalActive, aggregationTargetLabel } = useValues(logic)
    const { openPersonsModalForStep } = useActions(logic)
    const previousStep = getReferenceStep(steps, FunnelStepReference.previous, step.order)

    return (
        <div className="funnel-bar-wrapper breakdown vertical">
            <BreakdownVerticalBarGroup
                currentStep={step}
                previousStep={previousStep}
                showLabels={showLabels}
                onBarClick={(breakdown) => {
                    // Breakdown parameter carries nested breakdown information that should be passed into
                    // openPersonsModalForStep.
                    openPersonsModalForStep({ step: breakdown, converted: true })
                }}
                disabled={!isModalActive}
                aggregationTargetLabel={aggregationTargetLabel}
            />
            <div className="funnel-bar-empty-space" />
            <div className="funnel-bar-axis">
                <div className="axis-tick-line" />
                <div className="axis-tick-line" />
                <div className="axis-tick-line" />
                <div className="axis-tick-line" />
                <div className="axis-tick-line" />
                <div className="axis-tick-line" />
            </div>
        </div>
    )
}

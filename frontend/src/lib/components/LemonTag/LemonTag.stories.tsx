import { Meta, Story } from '@storybook/react'
import React from 'react'
import { ObjectTags as ObjectTagsComponent } from '../ObjectTags'

export default {
    title: 'PostHog/Components/LemonTag',
    parameters: { options: { showPanel: true } },
    argTypes: {
        loading: {
            control: { type: 'boolean' },
        },
        apiError: {
            control: { type: 'boolean' },
        },
        highlighted: {
            control: { type: 'boolean' },
        },
    },
} as Meta

export const ObjectTags: Story = () => {
    return <ObjectTagsComponent tags={['every', 'green', 'bus', 'drives', 'fast']} staticOnly />
}

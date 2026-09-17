/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

jest.mock('@attruvi/react-native', () => ({
  Attruvi: {
    initialize: jest.fn().mockResolvedValue(undefined),
    onAttributionChanged: jest.fn(() => jest.fn()),
    track: jest.fn().mockResolvedValue('event-id'),
    flush: jest.fn().mockResolvedValue({sent: 0, pending: 0}),
  },
}));

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});

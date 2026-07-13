import { render } from '@testing-library/react';

import App from './app';

describe('App', () => {
  it('should render successfully', () => {
    // App already includes BrowserRouter — don't wrap in another
    const { baseElement } = render(<App />);
    expect(baseElement).toBeTruthy();
  });

  it('should render the login page by default for unauthenticated users', () => {
    const { baseElement } = render(<App />);
    // Unauthenticated users should see the login page
    expect(baseElement.querySelector('form') || baseElement.querySelector('input')).toBeTruthy();
  });
});

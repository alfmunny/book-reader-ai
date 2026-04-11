import "@testing-library/jest-dom";

// jsdom doesn't implement layout APIs used by InsightChat
window.HTMLElement.prototype.scrollIntoView = jest.fn();

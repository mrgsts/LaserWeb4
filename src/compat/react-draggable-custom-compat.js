// Compatibility shim for @bokuweb/react-draggable-custom (react-draggable v2.x fork)
// Used by react-rnd@4.x. The original package accesses React.PropTypes which was
// removed in React 16. This shim injects the standalone prop-types package into
// React.PropTypes before loading the original module.
var React = require('react');
if (!React.PropTypes) {
    React.PropTypes = require('prop-types');
}
module.exports = require('../../node_modules/@bokuweb/react-draggable-custom');

import React, { forwardRef, useCallback, useEffect, useLayoutEffect, useRef } from 'react';

const AutoGrowTextarea = forwardRef(function AutoGrowTextarea(
  { value, onInput, style, ...props },
  forwardedRef,
) {
  const input = useRef(null);
  const resize = useCallback(() => {
    const field = input.current;
    if (!field) return;
    field.style.height = 'auto';
    if (!field.scrollHeight) return;
    const computed = getComputedStyle(field);
    const borders =
      parseFloat(computed.borderTopWidth || 0) + parseFloat(computed.borderBottomWidth || 0);
    const padding = parseFloat(computed.paddingTop || 0) + parseFloat(computed.paddingBottom || 0);
    field.style.height = `${field.scrollHeight + (computed.boxSizing === 'border-box' ? borders : -padding)}px`;
  }, []);
  useLayoutEffect(resize, [value, resize]);
  useEffect(() => {
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [resize]);
  return (
    <textarea
      {...props}
      value={value}
      style={{ ...style, resize: 'none' }}
      ref={(node) => {
        input.current = node;
        if (typeof forwardedRef === 'function') forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      }}
      onInput={(event) => {
        resize();
        onInput?.(event);
      }}
    />
  );
});

export default AutoGrowTextarea;

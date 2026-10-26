import { createContext, useContext } from 'react';
export const SurveyRuntimeContext = createContext(null);
export const useSurveyRuntime = () => useContext(SurveyRuntimeContext);

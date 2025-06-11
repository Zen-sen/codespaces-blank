import React, { useState } from 'react';
import SynapseReadApp from './SynapseReadApp';

// Initialize with default settings
const defaultSettings = {
  fixation: 0.5,
  opacity: 1.0,
  speed: 2.5,
  maxWordsPerChunk: 10,
  readingMode: 'chunk'
};

const defaultText = "Welcome to SynapseRead! This is a demo text to show how the enhanced reading interface works. You can upload your own text or paste content here to start reading with enhanced visualization.";

export default function App() {
  const [settings, setSettings] = useState(defaultSettings);

  const handleSummarize = () => console.log("Summarize clicked");
  const handleExplain = (text) => console.log("Explain clicked", text);
  const handleBuildVocabulary = (text) => console.log("Build vocabulary clicked", text);
  const handleGenerateQuestions = (text) => console.log("Generate questions clicked", text);
  const handleSimplify = (text) => console.log("Simplify clicked", text);
  const handleRephrase = (text) => console.log("Rephrase clicked", text);
  const handleTranslate = (text) => console.log("Translate clicked", text);
  const handleAnalyzeSentiment = (text) => console.log("Analyze sentiment clicked", text);
  const handleGetContextInfo = (text) => console.log("Get context info clicked", text);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <SynapseReadApp 
          text={defaultText}
          settings={settings}
          onSettingsChange={setSettings}
          onSummarize={handleSummarize}
          onExplainSelection={handleExplain}
          onBuildVocabulary={handleBuildVocabulary}
          onGenerateStudyQuestions={handleGenerateQuestions}
          onSimplifyText={handleSimplify}
          onRephraseSelectedText={handleRephrase}
          onTranslateSelectedText={handleTranslate}
          onAnalyzeSentiment={handleAnalyzeSentiment}
          onGetContextualInfo={handleGetContextInfo}
        />
      </div>
    </div>
  );
}

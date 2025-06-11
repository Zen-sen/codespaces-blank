import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Shield, Upload, Settings, Play, Pause, RotateCcw, Eye, Book, User, Zap, Accessibility, AlertTriangle, CheckCircle, FileText, Loader2, Lightbulb, GraduationCap, HelpCircle, MessageSquare, List, Shuffle, Languages, HardDrive, Smile, Info, ArrowLeft, ArrowRight } from 'lucide-react'; // Added new icons for paragraph navigation
import PropTypes from 'prop-types'; // Recommended for type checking in larger applications
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, updateDoc, doc, onSnapshot, query, orderBy, serverTimestamp } from 'firebase/firestore';


// --- Global Error Boundary Component ---
// Catches JavaScript errors anywhere in its child component tree,
// logs them, and displays a fallback UI instead of crashing the app.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  // Invoked after an error has been thrown by a descendant component.
  // It receives two arguments: the error and an object with errorInfo.
  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  // This lifecycle method is called after a component has caught an error.
  // Use it to log error information.
  componentDidCatch(error, errorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    // Call the prop function to log the error
    if (this.props.onErrorLogged) {
        this.props.onErrorLogged({
            message: error.message || 'Unknown error',
            stack: error.stack || 'No stack trace',
            componentStack: errorInfo.componentStack || 'N/A'
        });
    }
    // In a production app, you'd send this error to an analytics service (e.g., Sentry)
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      // Fallback UI when an error occurs
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center bg-red-50 border border-red-200 rounded-lg shadow-md">
          <AlertTriangle className="w-16 h-16 text-red-500 mb-4 animate-pulse" />
          <h2 className="text-2xl font-bold text-red-800 mb-2">Oops! Something went wrong.</h2>
          <p className="text-gray-600 mb-4">
            We're sorry for the inconvenience. Please try refreshing the page or contact support if the issue persists.
          </p>
          {/* Display error details in development mode for debugging */}
          {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
            <details className="text-sm text-gray-500 bg-gray-100 p-4 rounded-md mt-4 text-left overflow-auto max-h-60">
              <summary className="cursor-pointer font-semibold text-red-700">Error Details</summary>
              <pre className="whitespace-pre-wrap break-all">{this.state.error && this.state.error.toString()}</pre>
              <pre className="whitespace-pre-wrap break-all">{this.state.errorInfo.componentStack}</pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired,
  onErrorLogged: PropTypes.func, // Add onErrorLogged propType
};

// --- Firebase/Firestore Utility Functions ---
let dbInstance = null;
let authInstance = null;
let currentUserId = null; // Stored here for direct use by logErrorToFirestore

const firebaseInitializeAndAuth = async (firebaseConfig, appId) => {
  if (dbInstance && authInstance && currentUserId) {
    return { db: dbInstance, auth: authInstance, userId: currentUserId };
  }

  try {
    const app = initializeApp(firebaseConfig);
    dbInstance = getFirestore(app);
    authInstance = getAuth(app);

    await new Promise(resolve => {
        const unsubscribe = onAuthStateChanged(authInstance, async (user) => {
            if (user) {
                currentUserId = user.uid;
                console.log("Authenticated user:", currentUserId);
                unsubscribe(); // Stop listening once authenticated
                resolve();
            } else if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                try {
                    const userCredential = await signInWithCustomToken(authInstance, __initial_auth_token);
                    currentUserId = userCredential.user.uid;
                    console.log("Signed in with custom token:", currentUserId);
                } catch (error) {
                    console.warn("Custom token sign-in failed, falling back to anonymous:", error);
                    await signInAnonymously(authInstance); // onAuthStateChanged will catch this
                } finally {
                    unsubscribe();
                    resolve();
                }
            } else {
                try {
                    await signInAnonymously(authInstance); // onAuthStateChanged will catch this
                } catch (error) {
                    console.error("Anonymous sign-in failed:", error);
                    currentUserId = crypto.randomUUID(); // Fallback to random ID if anonymous fails
                    console.log("Using generated random ID for user:", currentUserId);
                } finally {
                    unsubscribe();
                    resolve();
                }
            }
        });
    });
  } catch (initError) {
    console.error("Firebase initialization or initial authentication failed:", initError);
    if (!currentUserId) { // Ensure currentUserId is set even if auth completely fails
      currentUserId = crypto.randomUUID();
      console.log("Using generated random ID due to Firebase init/auth failure:", currentUserId);
    }
  }

  return { db: dbInstance, auth: authInstance, userId: currentUserId, appId };
};

// Function to log errors to Firestore
const logErrorToFirestore = async (errorDetails, userId, appId) => {
  // Ensure dbInstance and userId are available before attempting to log
  if (!dbInstance || !userId || !appId) {
    console.error("Firestore not ready or user/app ID not available, cannot log error.");
    return;
  }

  try {
    const errorLogsCollectionRef = collection(dbInstance, `artifacts/${appId}/users/${userId}/errorLogs`);
    await addDoc(errorLogsCollectionRef, {
      message: errorDetails.message || 'Unknown error',
      stack: errorDetails.stack || 'No stack trace',
      componentStack: errorDetails.componentStack || 'N/A',
      timestamp: serverTimestamp(), // Firestore server timestamp
      fixed: false, // Default to not fixed
      fixDescription: ''
    });
    console.log("Error logged to Firestore successfully!");
  } catch (e) {
    console.error("Failed to log error to Firestore:", e);
  }
};


// Component to display and manage error logs
const ErrorLogViewer = ({ userId, db, appId, onToggleVisibility }) => {
  const [errorLogs, setErrorLogs] = useState([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(true);
  const [logError, setLogError] = useState('');
  const [showContent, setShowContent] = useState(false); // State to control content visibility

  // Toggle visibility and fetch logs if becoming visible
  const handleToggle = useCallback(() => {
    setShowContent(prev => !prev);
    onToggleVisibility && onToggleVisibility(!showContent); // Notify parent
  }, [showContent, onToggleVisibility]);


  useEffect(() => {
    if (!db || !userId || !showContent) { // Only fetch if content is visible and db/userId are ready
        setIsLoadingLogs(false);
        return;
    }

    const logsCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/errorLogs`);
    // Order by timestamp to show most recent errors first
    const q = query(logsCollectionRef, orderBy('timestamp', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setErrorLogs(logs);
      setIsLoadingLogs(false);
      setLogError('');
      console.log("Error logs fetched:", logs);
    }, (error) => {
      console.error("Error fetching error logs:", error);
      setLogError(`Failed to load error logs: ${error.message}`);
      setIsLoadingLogs(false);
    });

    // Cleanup subscription on component unmount or when content is hidden
    return () => unsubscribe();
  }, [db, userId, appId, showContent]); // Added showContent to dependencies

  const handleMarkAsFixed = async (logId, currentFixDescription) => {
    if (!db || !userId) {
        setLogError("Database not ready or user not authenticated. Cannot update error log.");
        return;
    }

    const docRef = doc(db, `artifacts/${appId}/users/${userId}/errorLogs`, logId);
    try {
      const newFixDescription = prompt("Enter fix description (optional):", currentFixDescription || "");
      if (newFixDescription !== null) { // User didn't cancel
        await updateDoc(docRef, {
          fixed: true,
          fixDescription: newFixDescription,
          fixedAt: serverTimestamp()
        });
        console.log(`Error log ${logId} marked as fixed.`);
      }
    } catch (e) {
      console.error("Error marking log as fixed:", e);
      setLogError(`Failed to mark log as fixed: ${e.message}`);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg border shadow-lg space-y-4">
      <div className="flex items-center justify-between mb-4 cursor-pointer" onClick={handleToggle}>
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-red-600" />
          <h3 className="text-lg font-semibold text-red-800">Error Logs</h3>
          {userId && <span className="text-sm text-gray-500 ml-2">(User ID: {userId.substring(0, 8)}...)</span>} {/* Truncate userId */}
        </div>
        <button className="text-gray-500 hover:text-gray-700 text-sm font-medium">
          {showContent ? 'Hide' : 'Show'}
        </button>
      </div>

      {showContent && (
        <>
          {isLoadingLogs ? (
            <div className="p-4 bg-gray-50 rounded-lg shadow-sm flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin mr-2 text-gray-500" />
              Loading error logs...
            </div>
          ) : logError ? (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              <AlertTriangle className="inline w-4 h-4 mr-2" />
              {logError}
            </div>
          ) : errorLogs.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No errors logged yet. Good job!</p>
          ) : (
            <div className="space-y-4 max-h-96 overflow-y-auto custom-scrollbar pr-2">
              {errorLogs.map(log => (
                <div key={log.id} className={`p-4 rounded-lg border ${log.fixed ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`font-semibold ${log.fixed ? 'text-green-800' : 'text-red-800'}`}>
                      {log.fixed ? 'Fixed Error' : 'Unfixed Error'}
                    </span>
                    {!log.fixed && (
                      <button
                        onClick={() => handleMarkAsFixed(log.id, log.fixDescription)}
                        className="px-3 py-1 bg-green-600 text-white text-xs rounded-full hover:bg-green-700 transition-colors"
                      >
                        Mark as Fixed
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 mb-1">
                    Logged: {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString() : 'N/A'}
                    {log.fixed && log.fixedAt?.toDate && ` | Fixed: ${log.fixedAt.toDate().toLocaleString()}`}
                  </p>
                  <details className="text-sm text-gray-600 cursor-pointer">
                    <summary>Stack Trace</summary>
                    <pre className="whitespace-pre-wrap break-all text-xs bg-gray-100 p-2 rounded-md mt-1">{log.stack}</pre>
                    {log.componentStack && log.componentStack !== 'N/A' && (
                      <>
                        <p className="mt-2">Component Stack:</p>
                        <pre className="whitespace-pre-wrap break-all text-xs bg-gray-100 p-2 rounded-md mt-1">{log.componentStack}</pre>
                      </>
                    )}
                  </details>
                  {log.fixed && log.fixDescription && (
                    <div className="mt-2 text-sm text-gray-700">
                      <span className="font-semibold">Fix:</span> {log.fixDescription}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

ErrorLogViewer.propTypes = {
  userId: PropTypes.string, // userId can be null initially
  db: PropTypes.object, // db can be null initially
  appId: PropTypes.string.isRequired,
  onToggleVisibility: PropTypes.func,
};


// --- Enhanced Security Utilities ---
const SecurityUtils = {
  // Sanitizes text to remove potentially harmful HTML tags and attributes.
  sanitizeText: (text) => {
    if (typeof text !== 'string') return '';
    // Strips HTML tags, JavaScript URI schemes, and event handlers.
    return text
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
      .replace(/<[^>]+>/g, '') // Remove any remaining HTML tags
      .replace(/javascript:/gi, '') // Remove javascript: URI schemes
      .replace(/on\w+=/gi, '') // Remove event handlers (e.g., onclick=)
      .trim();
  },
  // Validates if the file size is within the allowed limit (500MB).
  validateFileSize: (size) => size <= 500 * 1024 * 1024, // Increased to 500MB
  // Validates if the file type is among the allowed types.
  validateFileType: (type) => {
    // Expanded allowed types to include PDF and DOCX
    const allowedTypes = [
      'text/plain',
      'text/csv',
      'application/json',
      'application/pdf', // Portable Document Format
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' // .docx
    ];
    return allowedTypes.includes(type);
  },
  // Generates a cryptographically secure random ID.
  generateSecureId: () => crypto.getRandomValues(new Uint32Array(1))[0].toString(36),
  // Creates a simple rate-limiting function.
  createRateLimit: (maxCalls, timeWindow) => {
    const calls = []; // Stores timestamps of recent calls
    return () => {
      const now = Date.now();
      // Filter out calls that are outside the time window
      const validCalls = calls.filter(time => now - time < timeWindow);
      if (validCalls.length >= maxCalls) {
        throw new Error('Rate limit exceeded');
      }
      calls.push(now); // Add current call timestamp
      return true;
    };
  }
};

// --- Reading Enhancer Engine - Core Innovation ---
const ReadingEnhancerEngine = {
  // Calculates optimal fixation points based on word length and linguistic patterns.
  calculateFixation: (word, fixationLevel = 0.5) => {
    if (!word || word.length <= 1) return word.length;

    const lowerWord = word.toLowerCase();
    const len = word.length;
    let fixationPoint;

    // Rule 1: Basic length-based fixation
    fixationPoint = Math.ceil(len * fixationLevel);

    // Rule 2: Adjust for common prefixes (e.g., 'un', 're', 'pre')
    const prefixes = ['un', 're', 'pre', 'dis', 'in', 'im', 'ir', 'il', 'anti', 'auto', 'bio', 'co', 'de', 'ex', 'fore', 'inter', 'micro', 'mid', 'mono', 'non', 'over', 'post', 'pro', 'sub', 'super', 'trans', 'tri', 'under'];
    for (const prefix of prefixes) {
        if (lowerWord.startsWith(prefix) && len > prefix.length) {
            fixationPoint = Math.min(fixationPoint, prefix.length);
            break;
        }
    }

    // Rule 3: Adjust for common suffixes (e.g., 'ing', 'ed', 'tion')
    const suffixes = ['ing', 'ed', 'ly', 'tion', 'sion', 'able', 'ible', 'al', 'ent', 'ence', 'ive', 'ize', 'ise', 'ment', 'ness', 'ous', 'ful', 'less'];
    for (const suffix of suffixes) {
        if (lowerWord.endsWith(suffix) && len > suffix.length) {
            fixationPoint = Math.min(fixationPoint, len - suffix.length);
            break;
        }
    }

    // Rule 4: Balance for very short/long words
    if (len <= 3) {
        fixationPoint = 1;
    } else if (len > 8) {
        fixationPoint = Math.min(fixationPoint + 1, len - 1);
    }

    // Ensure fixation point is at least 1 and not the very last character
    return Math.min(Math.max(1, fixationPoint), len - 1);
  },

  // Processes a text into smaller, enhanced reading-formatted chunks.
  applyEnhancedFormatting: (text, settings) => {
    if (!text) return [];

    const { fixation, opacity, maxWordsPerChunk } = settings;
    const initialChunks = [];

    const paragraphs = text.split(/(?:\r?\n){2,}/).filter(p => p.trim() !== '');

    // --- Stage 1: Natural Chunking (Sentence/Clause-based) ---
    paragraphs.forEach(paragraphContent => {
      // Tokens: words (including contractions), punctuation, and spaces
      // This regex attempts to keep common abbreviations like "Dr." together by using a negative lookbehind.
      const tokens = paragraphContent.match(/(\b\w+'?\w*\b(?!\.)|[.,!?;:—-]+(?!\.)|\s+)/g) || [];

      let currentChunkItems = [];
      let currentChunkOriginalTextParts = [];

      tokens.forEach((token) => {
        if (!token) return; // Skip empty tokens

        const isWord = token.match(/^\b\w+'?\w*\b$/);
        const isSpace = token.match(/^\s+$/);
        // Expanded punctuation check to include all common sentence/clause terminators
        const isPunctuation = token.match(/^[.,!?;:—-]+$/);

        if (isWord) {
          const word = token;
          const fixationPoint = ReadingEnhancerEngine.calculateFixation(word, fixation);
          const bold = word.slice(0, fixationPoint);
          const normal = word.slice(fixationPoint);
          currentChunkItems.push({ type: 'word', content: token, bold, normal, opacity });
          currentChunkOriginalTextParts.push(token);
        } else if (isSpace) {
          currentChunkItems.push({ type: 'space', content: token });
          currentChunkOriginalTextParts.push(token);
        } else if (isPunctuation) {
          // Try to append punctuation to the preceding word in the current chunk
          let appended = false;
          // Iterate backwards to find the last word, skipping spaces
          for (let i = currentChunkItems.length - 1; i >= 0; i--) {
            if (currentChunkItems[i].type === 'word') {
              currentChunkItems[i].content += token;
              currentChunkItems[i].normal += token;
              appended = true;
              break;
            } else if (currentChunkItems[i].type === 'space') {
              // Keep looking backwards past spaces
              continue;
            } else {
              // Found another punctuation or unknown type before a word, stop looking backwards
              break;
            }
          }
          if (!appended) {
            // If no preceding word (e.g., starts with punctuation or only spaces so far), add as standalone
            currentChunkItems.push({ type: 'punctuation', content: token, opacity });
          }
          currentChunkOriginalTextParts.push(token);

          // Check if this punctuation marks the end of a natural reading chunk (sentence or major clause)
          // Prioritize full stops, exclamation marks, question marks for hard breaks
          // Commas, semicolons, em-dashes for softer breaks
          const endsSentence = token.match(/[.!?]$/);
          const endsClause = token.match(/[,;—]$/);

          if ((endsSentence || endsClause) && currentChunkItems.length > 0) {
            initialChunks.push({
              words: currentChunkItems,
              originalContent: currentChunkOriginalTextParts.join('')
            });
            currentChunkItems = [];
            currentChunkOriginalTextParts = [];
          }
        }
      });

      // After processing all tokens in a paragraph, add any remaining content as a chunk
      if (currentChunkItems.length > 0) {
        initialChunks.push({
          words: currentChunkItems,
          originalContent: currentChunkOriginalTextParts.join('')
        });
      }

      // Add a paragraph break marker if not the very last paragraph
      if (paragraphContent.trim().length > 0 && paragraphContent !== paragraphs[paragraphs.length - 1].trim()) {
        initialChunks.push({ words: [], originalContent: '', isParagraphBreak: true });
      }
    });

    // --- Stage 2: maxWordsPerChunk Fallback (for oversized natural chunks) ---
    const finalChunks = [];
    initialChunks.forEach(chunk => {
      if (chunk.isParagraphBreak) {
        finalChunks.push(chunk); // Preserve paragraph breaks
        return;
      }

      const wordItemsInChunk = chunk.words.filter(item => item.type === 'word');
      // Only apply maxWordsPerChunk fallback if the chunk's word count exceeds the limit
      // and it's not a natural break (which should have already been handled).
      // This is primarily for very long sentences without internal punctuation.
      if (wordItemsInChunk.length > maxWordsPerChunk) {
        let currentSubChunkItems = [];
        let currentSubChunkOriginalTextParts = [];
        let wordsCountInCurrentSubChunk = 0;

        chunk.words.forEach((item, index) => {
          currentSubChunkItems.push(item);
          currentSubChunkOriginalTextParts.push(item.content);

          if (item.type === 'word') {
            wordsCountInCurrentSubChunk++;
          }

          // If we've hit the maxWordsPerChunk limit OR it's the very last item of the oversized chunk
          if (wordsCountInCurrentSubChunk >= maxWordsPerChunk || index === chunk.words.length - 1) {
            // Find the nearest preceding space to break on if possible, for better readability
            let splitIndex = currentSubChunkItems.length - 1;
            for (let i = currentSubChunkItems.length - 1; i >= 0; i--) {
              if (currentSubChunkItems[i].type === 'space') {
                splitIndex = i;
                break;
              }
            }

            // Create a sub-chunk up to the split point
            const subChunkToPush = {
              words: currentSubChunkItems.slice(0, splitIndex + 1),
              originalContent: currentSubChunkOriginalTextParts.slice(0, splitIndex + 1).join('')
            };

            // Push if it contains actual content
            if (subChunkToPush.words.length > 0 && subChunkToPush.originalContent.trim() !== '') {
              finalChunks.push(subChunkToPush);
            }

            // Keep the remaining part for the next sub-chunk
            currentSubChunkItems = currentSubChunkItems.slice(splitIndex + 1);
            currentSubChunkOriginalTextParts = currentSubChunkOriginalTextParts.slice(splitIndex + 1);
            wordsCountInCurrentSubChunk = currentSubChunkItems.filter(item => item.type === 'word').length;

            // If we are at the very last item of the original oversized chunk and there's remaining content,
            // ensure it's pushed as a final sub-chunk.
            if (index === chunk.words.length - 1 && currentSubChunkItems.length > 0) {
              finalChunks.push({
                words: currentSubChunkItems,
                originalContent: currentSubChunkOriginalTextParts.join('')
              });
              currentSubChunkItems = []; // Clear for next iteration
              currentSubChunkOriginalTextParts = [];
              wordsCountInCurrentSubChunk = 0;
            }
          }
        });
      } else {
        // Chunk is fine, add as is
        finalChunks.push(chunk);
      }
    });

    // Assign final, sequential chunkIndex to all chunks
    finalChunks.forEach((chunk, index) => {
      chunk.chunkIndex = index;
    });

    return finalChunks;
  }
};


// --- Reading Progress Tracker ---
const ProgressTracker = {
  // Calculates Words Per Minute (WPM).
  calculateWPM: (wordsRead, timeElapsedSeconds) => {
    if (timeElapsedSeconds <= 0) return 0;
    // WPM = (Words Read / Time in Minutes)
    return Math.round((wordsRead / timeElapsedSeconds) * 60);
  },
  // Calculates a simplified comprehension score (conceptual).
  calculateComprehensionScore: (readingTime, pauseCount, backtrackCount) => {
    const baseScore = 100;
    const pausePenalty = pauseCount * 2; // Each pause reduces score by 2
    const backtrackPenalty = backtrackCount * 5; // Each backtrack reduces score by 5
    return Math.max(0, baseScore - pausePenalty - backtrackPenalty); // Score cannot be negative
  }
};

// --- Accessibility Features Component ---
const AccessibilityPanel = ({ settings, onSettingsChange }) => {
  // Predefined accessibility presets for different reading needs.
  const accessibilityPresets = {
    dyslexia: { fixation: 0.7, saccade: 1.2, opacity: 0.9, speed: 3.0, maxWordsPerChunk: 5 }, // Slower speed per chunk, more bolding, smaller chunks
    adhd: { fixation: 0.6, saccade: 0.8, opacity: 1.0, speed: 1.8, maxWordsPerChunk: 8 }, // Slightly faster speed per chunk, slightly more bolding, medium chunks
    default: { fixation: 0.5, saccade: 1.0, opacity: 1.0, speed: 2.5, maxWordsPerChunk: 10 } // Standard settings (adjusted for chunk-by-chunk reading, larger chunks)
  };

  // Applies a selected preset to the current settings.
  const applyPreset = (preset) => {
    onSettingsChange({ ...settings, ...accessibilityPresets[preset] });
  };

  return (
    <div className="bg-gradient-to-r from-purple-50 to-blue-50 p-6 rounded-lg border border-purple-200 shadow-xl">
      <div className="flex items-center gap-2 mb-4">
        <Accessibility className="w-5 h-5 text-purple-600" />
        <h3 className="text-lg font-semibold text-purple-800">Accessibility Presets</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3"> {/* Responsive grid for buttons */}
        {Object.keys(accessibilityPresets).map(preset => (
          <button
            key={preset}
            onClick={() => applyPreset(preset)}
            className="p-3 bg-white rounded-lg border hover:bg-purple-100 transition-all duration-300 text-sm font-medium capitalize shadow-sm
                       focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50 transform hover:scale-[1.02]"
          >
            {preset === 'default' ? 'Standard' : preset}
          </button>
        ))}
      </div>
    </div>
  );
};

AccessibilityPanel.propTypes = {
  settings: PropTypes.object.isRequired,
  onSettingsChange: PropTypes.func.isRequired,
};

// --- Enhanced Reader Component ---
const EnhancedReader = ({ text, settings, onProgress, onSummarize, onExplainSelection, onBuildVocabulary, onGenerateStudyQuestions, onSimplifyText, onRephraseSelectedText, onTranslateSelectedText, onAnalyzeSentiment, onGetContextualInfo }) => {
  const { readingMode } = settings;
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0); // Used for 'chunk' mode
  const [currentParagraphIndex, setCurrentParagraphIndex] = useState(0); // Used for 'paragraph' mode
  const [startTime, setStartTime] = useState(null);
  const [readingStats, setReadingStats] = useState({
    wordsRead: 0,
    wpm: 0,
    timeElapsed: 0,
    pauseCount: 0,
    backtrackCount: 0,
  });
  const [isProcessingTextForEnhancedReading, setIsProcessingTextForEnhancedReading] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [showLLMButtons, setShowLLMButtons] = useState(false);

  // State to hold the result of enhanced reading processing
  const [processedChunks, setProcessedChunks] = useState([]);

  // Memoize grouped paragraphs
  const groupedParagraphs = useMemo(() => {
    if (!processedChunks.length) return [];
    const paragraphs = [];
    let currentParagraph = [];
    processedChunks.forEach(chunk => {
      if (chunk.isParagraphBreak) {
        if (currentParagraph.length > 0) {
          paragraphs.push(currentParagraph);
        }
        currentParagraph = [];
      } else {
        currentParagraph.push(chunk);
      }
    });
    if (currentParagraph.length > 0) {
      paragraphs.push(currentParagraph);
    }
    return paragraphs;
  }, [processedChunks]);

  // Effect to process text into enhanced reading chunks whenever text or settings change
  useEffect(() => {
    const processText = () => {
      setIsProcessingTextForEnhancedReading(true);
      const chunks = ReadingEnhancerEngine.applyEnhancedFormatting(text, settings);
      setProcessedChunks(chunks);
      setIsProcessingTextForEnhancedReading(false);
      setCurrentChunkIndex(0); // Reset chunk index on new text/settings
      setCurrentParagraphIndex(0); // Reset paragraph index on new text/settings
      setIsPlaying(false); // Stop playing
      setStartTime(null); // Clear start time
      setReadingStats({ wordsRead: 0, wpm: 0, timeElapsed: 0, pauseCount: 0, backtrackCount: 0 }); // Reset stats
    };

    if (text) {
      processText();
    } else {
      setProcessedChunks([]); // Clear chunks if no text
    }
  }, [text, settings]); // Re-run effect when text or settings change

  // Determine current content to display based on readingMode
  const currentContentToDisplay = useMemo(() => {
    if (readingMode === 'chunk') {
      return processedChunks[currentChunkIndex];
    } else { // 'paragraph' mode
      const currentParaChunks = groupedParagraphs[currentParagraphIndex];
      // Flatten the chunks within the current paragraph for rendering
      return currentParaChunks ? { words: currentParaChunks.flatMap(chunk => chunk.words) } : null;
    }
  }, [readingMode, currentChunkIndex, currentParagraphIndex, processedChunks, groupedParagraphs]);

  // Calculate progress based on mode
  const progress = useMemo(() => {
    if (readingMode === 'chunk') {
      return processedChunks.length > 0 ? (currentChunkIndex / processedChunks.length) * 100 : 0;
    } else { // 'paragraph' mode
      return groupedParagraphs.length > 0 ? (currentParagraphIndex / groupedParagraphs.length) * 100 : 0;
    }
  }, [readingMode, currentChunkIndex, currentParagraphIndex, processedChunks, groupedParagraphs]);


  // Effect hook for the automatic reading interval ('chunk' mode only).
  useEffect(() => {
    let interval;
    if (isPlaying && readingMode === 'chunk' && currentChunkIndex < processedChunks.length) {
      if (!startTime) setStartTime(Date.now()); // Start timer when playing begins

      interval = setInterval(() => {
        setCurrentChunkIndex(prev => {
          const newIndex = prev + 1;
          if (newIndex >= processedChunks.length) {
            setIsPlaying(false); // Stop playing at end of text
            return prev;
          }

          // Sum words read up to the new current chunk for WPM calculation
          let wordsReadUpToCurrentChunk = 0;
          for (let i = 0; i < newIndex; i++) {
            wordsReadUpToCurrentChunk += processedChunks[i].words.filter(word => word.type === 'word').length;
          }

          const elapsed = (Date.now() - startTime) / 1000; // Time in seconds
          const wpm = ProgressTracker.calculateWPM(wordsReadUpToCurrentChunk, elapsed);

          setReadingStats(prevStats => ({
            ...prevStats,
            wordsRead: wordsReadUpToCurrentChunk,
            wpm,
            timeElapsed: elapsed,
          }));

          // Notify parent component about reading progress
          onProgress && onProgress({ wordsRead: wordsReadUpToCurrentChunk, wpm, progress: (newIndex / processedChunks.length) * 100 });

          return newIndex;
        });
      }, settings.speed * 1000); // Interval based on user-defined speed (per chunk)
    }

    // Cleanup function: clear the interval when component unmounts or dependencies change
    return () => clearInterval(interval);
  }, [isPlaying, currentChunkIndex, processedChunks.length, settings.speed, startTime, onProgress, processedChunks, readingMode]);

  // Handler for Play/Pause button ('chunk' mode only).
  const handlePlayPause = useCallback(() => {
    if (readingMode !== 'chunk') return; // Only allow in chunk mode

    if (!isPlaying && !startTime) {
      setStartTime(Date.now()); // Set start time only once when playback begins initially
    } else if (isPlaying) {
      // If pausing, increment pause count
      setReadingStats(prev => ({ ...prev, pauseCount: prev.pauseCount + 1 }));
    }
    setIsPlaying(prev => !prev); // Toggle playing state
  }, [isPlaying, startTime, readingMode]);

  // Handler for Reset button.
  const handleReset = useCallback(() => {
    setIsPlaying(false); // Stop playing
    setCurrentChunkIndex(0); // Reset chunk index to beginning
    setCurrentParagraphIndex(0); // Reset paragraph index to beginning
    setStartTime(null); // Clear start time
    setReadingStats({ wordsRead: 0, wpm: 0, timeElapsed: 0, pauseCount: 0, backtrackCount: 0 }); // Reset all stats
  }, []);

  // Handler for text selection
  const handleTextSelection = useCallback(() => {
    const selection = window.getSelection();
    const text = selection.toString().trim();
    if (text.length > 0) {
      setSelectedText(text);
      setShowLLMButtons(true); // Show buttons when text is selected
    } else {
      setSelectedText('');
      setShowLLMButtons(false); // Hide buttons when no text is selected
    }
  }, []);

  // Navigation for 'paragraph' mode
  const handleNextParagraph = useCallback(() => {
    if (currentParagraphIndex < groupedParagraphs.length - 1) {
      setCurrentParagraphIndex(prev => prev + 1);
      // Only increment words read for the current paragraph on forward movement in paragraph mode
      setReadingStats(prev => ({ ...prev, wordsRead: prev.wordsRead + (groupedParagraphs[currentParagraphIndex]?.flatMap(chunk => chunk.words).filter(word => word.type === 'word').length || 0) }));
    }
  }, [currentParagraphIndex, groupedParagraphs]);

  const handlePreviousParagraph = useCallback(() => {
    if (currentParagraphIndex > 0) {
      setCurrentParagraphIndex(prev => prev - 1);
      setReadingStats(prev => ({ ...prev, backtrackCount: prev.backtrackCount + 1 })); // Increment backtrack count
    }
  }, [currentParagraphIndex]);

  // Show loading state if text is being processed.
  if (isProcessingTextForEnhancedReading) {
    return (
      <div className="flex flex-col items-center justify-center bg-white p-12 rounded-lg border shadow-xl min-h-[300px]">
        <Loader2 className="w-16 h-16 text-blue-500 animate-spin mb-4" />
        <p className="text-xl font-semibold text-gray-700">Processing text for enhanced reading...</p>
        <p className="text-gray-500 text-sm mt-2">This might take a moment for very large files.</p>
      </div>
    );
  }

  // Display message if no text content is available after processing.
  if (!currentContentToDisplay || processedChunks.length === 0) {
    return (
      <div className="text-center p-8 text-gray-500 bg-white rounded-lg border shadow-xl min-h-[300px] flex flex-col justify-center items-center">
        <Book className="w-16 h-16 mx-auto mb-4 opacity-50" />
        <p className="text-lg">No text content available for enhanced reading. Please upload a file.</p>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 sm:p-8 rounded-lg border shadow-xl"> {/* Added responsive padding */}
      {/* Enhanced Reading Display */}
      <div className="text-center mb-6 sm:mb-8 min-h-[120px] sm:min-h-[150px] flex items-center justify-center">
        <p
          className="text-xl sm:text-3xl lg:text-4xl font-mono leading-relaxed px-4 break-words"
          onMouseUp={handleTextSelection} // Capture text selection
        >
          {currentContentToDisplay.words.map((item, idx) => (
            item.type === 'word' || item.type === 'punctuation' ? (
              <span key={item.index + '-' + idx} style={{ opacity: item.opacity }}>
                <span className="font-bold text-blue-900">{item.bold}</span>
                <span className="font-normal text-gray-600" style={{ opacity: item.opacity * 0.7 }}>{item.normal}</span>
              </span>
            ) : (
              <span key={item.index + '-' + idx}>{item.content}</span> // Render spaces
            )
          ))}
        </p>
      </div>

      {/* Reading Controls */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
          {readingMode === 'chunk' && ( // Show Play/Pause only in chunk mode
            <button
              onClick={handlePlayPause}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all duration-300 shadow-md transform hover:scale-[1.02]
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              {isPlaying ? 'Pause' : 'Play'}
            </button>
          )}
          {readingMode === 'paragraph' && ( // Show paragraph navigation buttons
            <>
              <button
                onClick={handlePreviousParagraph}
                disabled={currentParagraphIndex === 0}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all duration-300 shadow-md transform hover:scale-[1.02]
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ArrowLeft className="w-5 h-5" />
                Prev Paragraph
              </button>
              <button
                onClick={handleNextParagraph}
                disabled={currentParagraphIndex >= groupedParagraphs.length - 1}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all duration-300 shadow-md transform hover:scale-[1.02]
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next Paragraph
                <ArrowRight className="w-5 h-5" />
              </button>
            </>
          )}

          <button
            onClick={handleReset}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-all duration-300 shadow-md transform hover:scale-[1.02]
                       focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50"
          >
            <RotateCcw className="w-5 h-5" />
            Reset
          </button>
          {text && ( // Only show summarize button if text is loaded
            <button
              onClick={onSummarize}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all duration-300 shadow-md transform hover:scale-[1.02]
                         focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50"
            >
              <Lightbulb className="w-5 h-5" />
              Summarize Text ✨
            </button>
          )}
          {selectedText && showLLMButtons && ( // Show LLM buttons if text is selected
            <>
              <button
                onClick={() => { onExplainSelection(selectedText); setSelectedText(''); setShowLLMButtons(false); }}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all duration-300 shadow-md transform hover:scale-[1.02]
                           focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50"
              >
                <Lightbulb className="w-5 h-5" />
                Explain Selection ✨
              </button>
              <button
                onClick={() => { onBuildVocabulary(selectedText); setSelectedText(''); setShowLLMButtons(false); }}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-all duration-300 shadow-md transform hover:scale-[1.02]
                           focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-opacity-50"
              >
                <GraduationCap className="w-5 h-5" />
                Build Vocabulary ✨
              </button>
              <button
                onClick={() => { onGenerateStudyQuestions(selectedText); setSelectedText(''); setShowLLMButtons(false); }}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-800 text-white rounded-lg hover:bg-blue-900 transition-all duration-300 shadow-md transform hover:scale-[1.02]
                           focus:outline-none focus:ring-2 focus:ring-blue-700 focus:ring-opacity-50"
              >
                <HelpCircle className="w-5 h-5" />
                Study Questions ✨
              </button>
              <button
                onClick={() => { onSimplifyText(selectedText); setSelectedText(''); setShowLLMButtons(false); }}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-green-800 text-white rounded-lg hover:bg-green-900 transition-all duration-300 shadow-md transform hover:scale-[1.02]
                           focus:outline-none focus:ring-2 focus:ring-green-700 focus:ring-opacity-50"
              >
                <Lightbulb className="w-5 h-5" />
                Simplify Text ✨
              </button>
              <button
                onClick={() => { onRephraseSelectedText(selectedText); setSelectedText(''); setShowLLMButtons(false); }}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all duration-300 shadow-md transform hover:scale-[1.02]
                           focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-opacity-50"
              >
                <Shuffle className="w-5 h-5" />
                Rephrase Selection ✨
              </button>
              <button
                onClick={() => { onTranslateSelectedText(selectedText); setSelectedText(''); setShowLLMButtons(false); }}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-pink-600 text-white rounded-lg hover:bg-pink-700 transition-all duration-300 shadow-md transform hover:scale-[1.02]
                           focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-opacity-50"
              >
                <Languages className="w-5 h-5" />
                Translate Selection ✨
              </button>
              <button
                onClick={() => { onAnalyzeSentiment(selectedText); setSelectedText(''); setShowLLMButtons(false); }}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-all duration-300 shadow-md transform hover:scale-[1.02]
                           focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-opacity-50"
              >
                <Smile className="w-5 h-5" />
                Analyze Sentiment ✨
              </button>
              <button
                onClick={() => { onGetContextualInfo(selectedText); setSelectedText(''); setShowLLMButtons(false); }}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-all duration-300 shadow-md transform hover:scale-[1.02]
                           focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-opacity-50"
              >
                <Info className="w-5 h-5" />
                Contextual Info ✨
              </button>
            </>
          )}
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-gray-200 rounded-full h-3 shadow-inner mt-4"> {/* Added margin-top */}
          <div
            className="bg-gradient-to-r from-blue-500 to-purple-600 h-3 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Reading Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 text-center text-sm mt-4"> {/* Added margin-top */}
          <div className="bg-blue-50 p-3 rounded-lg shadow-sm">
            <div className="font-bold text-blue-800 text-base sm:text-lg">{readingStats.wordsRead}</div>
            <div className="text-blue-600">Words Read</div>
          </div>
          <div className="bg-green-50 p-3 rounded-lg shadow-sm">
            <div className="font-bold text-green-800 text-base sm:text-lg">{readingStats.wpm}</div>
            <div className="text-green-600">WPM</div>
          </div>
          <div className="bg-purple-50 p-3 rounded-lg shadow-sm">
            <div className="font-bold text-purple-800 text-base sm:text-lg">{Math.round(progress)}%</div>
            <div className="text-purple-600">Progress</div>
          </div>
          <div className="bg-orange-50 p-3 rounded-lg shadow-sm">
            <div className="font-bold text-orange-800 text-base sm:text-lg">{Math.round(readingStats.timeElapsed)}s</div>
            <div className="text-orange-600">Time</div>
          </div>
        </div>
      </div>
    </div>
  );
};

EnhancedReader.propTypes = {
  text: PropTypes.string.isRequired,
  settings: PropTypes.object.isRequired,
  onProgress: PropTypes.func,
  onSummarize: PropTypes.func.isRequired,
  onExplainSelection: PropTypes.func.isRequired,
  onBuildVocabulary: PropTypes.func.isRequired,
  onGenerateStudyQuestions: PropTypes.func.isRequired,
  onSimplifyText: PropTypes.func.isRequired,
  onRephraseSelectedText: PropTypes.func.isRequired,
  onTranslateSelectedText: PropTypes.func.isRequired,
  onAnalyzeSentiment: PropTypes.func.isRequired, // New prop
  onGetContextualInfo: PropTypes.func.isRequired, // New prop
};

// --- Enhanced Settings Panel ---
const EnhancedSettings = ({ settings, onSettingsChange }) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Handles changes to settings, applying validation.
  const handleSettingChange = useCallback((key, value) => {
    let validatedValue = parseFloat(value);
    if (isNaN(validatedValue)) {
      validatedValue = settings[key]; // Fallback to current setting if input is invalid
    }

    switch (key) {
      case 'speed':
        validatedValue = Math.max(0.5, Math.min(10, validatedValue)); // Speed between 0.5s and 10s per chunk
        break;
      case 'fixation':
        validatedValue = Math.max(0.2, Math.min(0.8, validatedValue)); // Fixation between 20% and 80%
        break;
      case 'saccade':
        validatedValue = Math.max(0.5, Math.min(1.5, validatedValue)); // Saccade between 50% and 150%
        break;
      case 'opacity':
        validatedValue = Math.max(0.3, Math.min(1, validatedValue)); // Opacity between 30% and 100%
        break;
      case 'maxWordsPerChunk': // New case for maxWordsPerChunk
        validatedValue = Math.max(3, Math.min(20, Math.round(validatedValue))); // 3 to 20 words per chunk, integer
        break;
      case 'readingMode':
        validatedValue = value; // 'chunk' or 'paragraph'
        break;
      default:
        break;
    }

    onSettingsChange({ ...settings, [key]: validatedValue });
  }, [settings, onSettingsChange]);

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg border shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Zap className="w-5 h-5 text-blue-600" />
            Enhanced Reading Settings
          </h3>
          <button
            onClick={() => setShowAdvanced(prev => !prev)}
            className="text-blue-600 hover:text-blue-800 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-300 rounded-md px-2 py-1 transition-colors duration-200"
          >
            {showAdvanced ? 'Hide' : 'Show'} Advanced
          </button>
        </div>

        <div className="space-y-6">
          {/* Reading Mode Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Reading Mode
            </label>
            <div className="flex space-x-4">
              <label className="inline-flex items-center">
                <input
                  type="radio"
                  className="form-radio h-4 w-4 text-blue-600"
                  name="readingMode"
                  value="chunk"
                  checked={settings.readingMode === 'chunk'}
                  onChange={(e) => handleSettingChange('readingMode', e.target.value)}
                />
                <span className="ml-2 text-gray-700">Chunk by Chunk</span>
              </label>
              <label className="inline-flex items-center">
                <input
                  type="radio"
                  className="form-radio h-4 w-4 text-blue-600"
                  name="readingMode"
                  value="paragraph"
                  checked={settings.readingMode === 'paragraph'}
                  onChange={(e) => handleSettingChange('readingMode', e.target.value)}
                />
                <span className="ml-2 text-gray-700">Full Paragraph</span>
              </label>
            </div>
          </div>

          {/* Reading Speed */}
          {settings.readingMode === 'chunk' && ( // Only show speed control for chunk mode
            <div>
              <label htmlFor="speed-range" className="block text-sm font-medium text-gray-700 mb-2">
                Reading Speed ({settings.speed.toFixed(1)}s per chunk)
              </label>
              <input
                id="speed-range"
                type="range"
                min="0.5"
                max="10"
                step="0.1"
                value={settings.speed}
                onChange={(e) => handleSettingChange('speed', e.target.value)}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600 transition-all duration-300"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>Fast (0.5s)</span>
                <span>Slow (10s)</span>
              </div>
            </div>
          )}

          {/* Max Words Per Chunk */}
          {settings.readingMode === 'chunk' && ( // Only show max words per chunk for chunk mode
            <div>
              <label htmlFor="max-words-per-chunk-range" className="block text-sm font-medium text-gray-700 mb-2">
                Max Words Per Chunk ({settings.maxWordsPerChunk} words)
              </label>
              <input
                id="max-words-per-chunk-range"
                type="range"
                min="3"
                max="20"
                step="1"
                value={settings.maxWordsPerChunk}
                onChange={(e) => handleSettingChange('maxWordsPerChunk', e.target.value)}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600 transition-all duration-300"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>Smaller Chunks</span>
                <span>Larger Chunks</span>
              </div>
            </div>
          )}

          {/* Fixation Level */}
          <div>
            <label htmlFor="fixation-range" className="block text-sm font-medium text-gray-700 mb-2">
              Fixation Level ({Math.round(settings.fixation * 100)}%)
            </label>
            <input
              id="fixation-range"
              type="range"
              min="0.2"
              max="0.8"
              step="0.1"
              value={settings.fixation}
              onChange={(e) => handleSettingChange('fixation', e.target.value)}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600 transition-all duration-300"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>Less Bold</span>
              <span>More Bold</span>
            </div>
          </div>

          {showAdvanced && (
            <>
              {/* Saccade */}
              <div>
                <label htmlFor="saccade-range" className="block text-sm font-medium text-gray-700 mb-2">
                  Saccade ({Math.round(settings.saccade * 100)}%)
                </label>
                <input
                  id="saccade-range"
                  type="range"
                  min="0.5"
                  max="1.5"
                  step="0.1"
                  value={settings.saccade}
                  onChange={(e) => handleSettingChange('saccade', e.target.value)}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600 transition-all duration-300"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>Narrow Gaze</span>
                  <span>Wide Gaze</span>
                </div>
              </div>

              {/* Opacity */}
              <div>
                <label htmlFor="opacity-range" className="block text-sm font-medium text-gray-700 mb-2">
                  Text Opacity ({Math.round(settings.opacity * 100)}%)
                </label>
                <input
                  id="opacity-range"
                  type="range"
                  min="0.3"
                  max="1"
                  step="0.1"
                  value={settings.opacity}
                  onChange={(e) => handleSettingChange('opacity', e.target.value)}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600 transition-all duration-300"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>Fainter</span>
                  <span>Full Visibility</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <AccessibilityPanel settings={settings} onSettingsChange={onSettingsChange} />
    </div>
  );
};

EnhancedSettings.propTypes = {
  settings: PropTypes.object.isRequired,
  onSettingsChange: PropTypes.func.isRequired,
};

// --- Secure File Importer ---
const SecureFileImporter = ({ onFileLoaded, onSecurityStatus }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState([]);
  const [showDriveMessage, setShowDriveMessage] = useState(false); // New state for Drive message

  // Dynamically load PDF.js library
  const loadPdfJs = useCallback(async () => {
    // Only load if not already loaded
    if (typeof window.pdfjsLib === 'undefined') {
      console.log("Loading PDF.js...");
      try {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js';
          script.onload = () => {
            // Set up the worker source
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
            console.log("PDF.js loaded successfully.");
            resolve();
          };
          script.onerror = (e) => {
            console.error("Failed to load PDF.js script:", e);
            reject(new Error("Failed to load PDF.js script from CDN. This is likely due to network issues or a Content Security Policy (CSP) blocking external scripts. If you control the environment, please ensure 'https://cdnjs.cloudflare.com' is whitelisted, or serve the library locally."));
          };
          document.head.appendChild(script);
        });
      } catch (error) {
        throw new Error(`Failed to load PDF.js: ${error.message}`);
      }
    }
  }, []);

  // Dynamically load Mammoth.js library
  const loadMammothJs = useCallback(async () => {
    // Only load if not already loaded
    if (typeof window.mammoth === 'undefined') {
      console.log("Loading Mammoth.js...");
      try {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth.js/1.6.0/mammoth.browser.min.js';
          script.onload = () => {
            console.log("Mammoth.js loaded successfully.");
            resolve();
          };
          script.onerror = (e) => {
            console.error("Failed to load Mammoth.js script:", e);
            reject(new Error("Failed to load Mammoth.js script from CDN. This is likely due to network issues or a Content Security Policy (CSP) blocking external scripts. If you control the environment, please ensure 'https://cdnjs.cloudflare.com' is whitelisted, or serve the library locally."));
          };
          document.head.appendChild(script);
        });
      } catch (error) {
        throw new Error(`Failed to load Mammoth.js: ${error.message}`);
      }
    }
  }, []);

  // Parses PDF file content
  const parsePdf = useCallback(async (file) => {
    console.log("Starting PDF parsing for file:", file.name);
    try {
      await loadPdfJs(); // Ensure PDF.js is loaded
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i); // Corrected: use `pdf.getPage`
        const textContent = await page.getTextContent();
        fullText += textContent.items.map(item => item.str).join(' ') + '\n\n';
      }
      console.log("PDF parsing completed.");
      return fullText;
    } catch (error) {
      console.error("Error during PDF parsing:", error);
      throw new Error(`PDF parsing failed: ${error.message || error.toString()}`);
    }
  }, [loadPdfJs]);

  // Parses DOCX file content
  const parseDocx = useCallback(async (file) => {
    console.log("Starting DOCX parsing for file:", file.name);
    try {
      await loadMammothJs(); // Ensure Mammoth.js is loaded
      const arrayBuffer = await file.arrayBuffer();
      const result = await window.mammoth.extractRawText({ arrayBuffer: arrayBuffer });
      console.log("DOCX parsing completed.");
      return result.value; // The raw text
    } catch (error) {
      console.error("Error during DOCX parsing:", error);
      throw new Error(`DOCX parsing failed: ${error.message || error.toString()}`);
    }
  }, [loadMammothJs]);

  // Validates and processes the selected file.
  const validateAndProcessFile = useCallback(async (file) => {
    let newErrors = [];

    console.log("File object received in validateAndProcessFile:", file); // Debugging line
    console.log("Type of file:", typeof file, "Is File instance:", file instanceof File, "Is Blob instance:", file instanceof Blob); // Debugging line

    try {
      if (!file) {
        newErrors.push('No file selected.');
      } else {
        // Add explicit type check for robustness
        if (!(file instanceof File) && !(file instanceof Blob)) {
          newErrors.push('Provided input is not a valid file or blob. Please select a file from your device.');
          setErrors(newErrors);
          onSecurityStatus(false, newErrors);
          return;
        }

        // Validate file size and type using SecurityUtils
        if (!SecurityUtils.validateFileSize(file.size)) {
          newErrors.push(`File size (${(file.size / (1024 * 1024)).toFixed(2)}MB) exceeds 500MB limit. Please choose a smaller file.`);
        }

        if (!SecurityUtils.validateFileType(file.type)) {
          newErrors.push(`Unsupported file type: "${file.type}". Please upload .txt, .csv, .json, .pdf, or .docx files.`);
        }
      }

      if (newErrors.length > 0) {
        setErrors(newErrors);
        onSecurityStatus(false, newErrors);
        return; // Stop if there are initial validation errors
      }

      setIsLoading(true); // Indicate loading state
      let rawText = '';

      // Determine how to read the file based on its type
      if (file.type === 'application/pdf') {
        rawText = await parsePdf(file);
      } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        rawText = await parseDocx(file);
      } else {
        // For text-based files
        rawText = await file.text();
      }
      
      console.log("Raw text extracted. Length:", rawText.length);
      const sanitizedText = SecurityUtils.sanitizeText(rawText); // Sanitize content after extraction
      console.log("Text sanitized. Length:", sanitizedText.length);

      if (sanitizedText.length === 0) {
        newErrors.push('The file appears to be empty or contains only disallowed content after security sanitization. Please ensure the file has valid text.');
        setErrors(newErrors);
        onSecurityStatus(false, newErrors);
        return;
      }

      setErrors([]); // Clear any previous errors
      onSecurityStatus(true, []); // Indicate secure status
      onFileLoaded(sanitizedText); // Pass the sanitized text to the parent component

    } catch (error) {
      // Catch any unexpected errors during file processing
      let errorMsg;
      if (error instanceof Error) {
        errorMsg = `File processing failed: ${error.message}. Please try again or use a different file.`;
      } else if (typeof error === 'object' && error !== null && 'isTrusted' in error) {
        // This specifically targets the {"isTrusted": true} type of error for CDN loading
        errorMsg = `A script required for file processing (e.g., PDF/DOCX) could not be loaded from its CDN. This might be due to a network issue, ad blocker, or Content Security Policy (CSP). To resolve, please ensure 'https://cdnjs.cloudflare.com' is whitelisted, or serve the library files (pdf.js and mammoth.js) locally with your application.`;
        console.warn("Non-Error object (likely a script load event) caught in file processing:", error);
      } else if (typeof error === 'object' && error !== null) {
        errorMsg = `File operation failed (unexpected error format: ${JSON.stringify(error)}). Please try again or use a different file.`;
        console.warn("Non-Error object caught in file processing:", error); // Log this unusual object
      } else {
        errorMsg = `An unknown error occurred during file processing: ${error}. Please try again.`;
      }
      
      setErrors([errorMsg]);
      onSecurityStatus(false, [errorMsg]);
      console.error("Final catch block received error:", error); // Log the full error object for debugging
    } finally {
      setIsLoading(false); // End loading state
    }
  }, [onFileLoaded, onSecurityStatus, parsePdf, parseDocx]); // Dependencies for useCallback

  // Handles file drop event for drag-and-drop functionality.
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      validateAndProcessFile(files[0]); // Process the first dropped file
    }
  }, [validateAndProcessFile]); // Dependency on validateAndProcessFile

  // Handles file selection via input field.
  const handleFileSelect = useCallback((e) => {
    const file = e.target.files[0];
    if (file) {
      validateAndProcessFile(file); // Process the selected file
    }
  }, [validateAndProcessFile]); // Dependency on validateAndProcessFile

  return (
    <div className="space-y-4">
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-all duration-300 ${
          isDragging ? 'border-blue-500 bg-blue-50 scale-[1.02] shadow-lg' : 'border-gray-300 bg-white shadow-md'
        } ${isLoading ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()} // Required to allow drop
        onDragEnter={() => setIsDragging(true)}
        onDragLeave={() => setIsDragging(false)}
      >
        <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
        <p className="text-lg font-medium text-gray-700 mb-2">
          {isLoading ? 'Processing file, please wait...' : 'Drag & drop your text file here or click to browse'}
        </p>
        <p className="text-sm text-gray-500 mb-4">
          Supported formats: .txt, .csv, .json, .pdf, .docx (max 500MB)
        </p>
        <input
          type="file"
          accept=".txt,.csv,.json,.pdf,.docx" // Updated accept attribute
          onChange={handleFileSelect}
          className="hidden"
          id="fileInput"
          disabled={isLoading} // Disable input while loading
        />
        <label
          htmlFor="fileInput"
          className="inline-flex items-center px-5 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 cursor-pointer disabled:opacity-50 shadow-lg transform hover:scale-[1.05] transition-transform duration-200"
        >
          <FileText className="w-4 h-4 mr-2" />
          Choose File
        </label>
      </div>

      {/* Google Drive Button */}
      <button
        onClick={() => setShowDriveMessage(true)}
        className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-green-500 to-lime-600 text-white rounded-lg hover:from-green-600 hover:to-lime-700 cursor-pointer disabled:opacity-50 shadow-lg transform hover:scale-[1.02] transition-transform duration-200"
        disabled={isLoading}
      >
        <HardDrive className="w-5 h-5" />
        Load from Google Drive (Beta)
      </button>

      {/* Google Drive Integration Message Modal */}
      {showDriveMessage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 shadow-2xl max-w-md w-full space-y-4 animate-fade-in-up">
            <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <HardDrive className="w-6 h-6 text-green-600" /> Google Drive Integration
            </h3>
            <p className="text-gray-700">
              For a full, secure Google Drive integration, a real-world application would typically:
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-1">
              <li>Utilize Google OAuth 2.0 for secure user authentication.</li>
              <li>Employ the Google Picker API for a user-friendly file selection interface.</li>
              <li>Require a secure backend server to handle file content retrieval due to browser CORS policies and authentication complexities.</li>
            </ul>
            <p className="text-gray-700 font-semibold">
              In this client-side demo environment, direct fetching of arbitrary files from Google Drive is not supported due to these technical limitations and security requirements.
            </p>
            <button
              onClick={() => setShowDriveMessage(false)}
              className="w-full px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-md transform hover:scale-[1.02]"
            >
              Got It!
            </button>
          </div>
        </div>
      )}

      {/* Display errors if any */}
      {errors.length > 0 && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg shadow-md">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <span className="font-medium text-red-800">Security Issues Detected:</span>
          </div>
          <ul className="text-sm text-red-700 space-y-1 list-disc pl-5">
            {errors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

SecureFileImporter.propTypes = {
  onFileLoaded: PropTypes.func.isRequired,
  onSecurityStatus: PropTypes.func.isRequired,
};

// --- Security Status Component ---
const SecurityStatus = ({ isSecure, errors }) => (
  <div className={`flex items-center gap-2 p-3 rounded-lg border shadow-md
    ${isSecure ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}
  >
    <Shield className={`w-5 h-5 ${isSecure ? 'text-green-600' : 'text-red-600'}`} />
    <span className={`font-medium ${isSecure ? 'text-green-800' : 'text-red-800'}`}>
      Security Status: {isSecure ? 'Secure' : 'Issues Detected'}
    </span>
    {errors.length > 0 && (
      <div className="ml-auto text-sm font-semibold text-red-600">
        ({errors.length} issue{errors.length > 1 ? 's' : ''})
      </div>
    )}
    {isSecure && errors.length === 0 && (
      <CheckCircle className="w-5 h-5 text-green-600 ml-auto" />
    )}
  </div>
);

SecurityStatus.propTypes = {
  isSecure: PropTypes.bool.isRequired,
  errors: PropTypes.array.isRequired,
};

// --- Main App Component: SynapseReadApp ---
const SynapseReadApp = () => {
  const [fileContent, setFileContent] = useState('');
  const [settings, setSettings] = useState({
    speed: 2.5, // Adjusted default speed for chunk-by-chunk reading
    fixation: 0.5,
    saccade: 1,
    opacity: 1,
    maxWordsPerChunk: 10, // New default setting for max words per chunk
    readingMode: 'chunk', // New setting: 'chunk' or 'paragraph'
  });
  const [securityStatus, setSecurityStatus] = useState({ isSecure: true, errors: [] });
  const [readingProgress, setReadingProgress] = useState(null);
  const [summary, setSummary] = useState(''); // State to store the generated summary
  const [isSummarizing, setIsSummarizing] = useState(false); // State for summarization loading
  const [summaryError, setSummaryError] = useState(''); // State for summary errors
  const [showSummary, setShowSummary] = useState(false); // State to toggle summary visibility

  const [explanation, setExplanation] = useState(''); // State to store the generated explanation
  const [isExplaining, setIsExplaining] = useState(false); // State for explanation loading
  const [explanationError, setExplanationError] = useState(''); // State for explanation errors
  const [showExplanation, setShowExplanation] = useState(false); // State to toggle explanation visibility

  const [vocabulary, setVocabulary] = useState(null); // State to store vocabulary data (object with definition, synonyms, antonyms, examples)
  const [isBuildingVocabulary, setIsBuildingVocabulary] = useState(false); // State for vocabulary loading
  const [vocabularyError, setVocabularyError] = useState(''); // State for vocabulary errors
  const [showVocabulary, setShowVocabulary] = useState(false); // State to toggle vocabulary visibility

  const [studyQuestions, setStudyQuestions] = useState(null); // State for study questions
  const [isGeneratingStudyQuestions, setIsGeneratingStudyQuestions] = useState(false);
  const [studyQuestionsError, setStudyQuestionsError] = useState('');
  const [showStudyQuestions, setShowStudyQuestions] = useState(false);

  const [simplifiedText, setSimplifiedText] = useState(''); // State for simplified text
  const [isSimplifying, setIsSimplifying] = useState(false);
  const [simplifyError, setSimplifyError] = useState('');
  const [showSimplifiedText, setShowSimplifiedText] = useState(false);

  const [faqAnswers, setFaqAnswers] = useState(null); // State for FAQ answers
  const [isAnsweringFaq, setIsAnsweringFaq] = useState(false);
  const [faqError, setFaqError] = useState('');
  const [showFaq, setShowFaq] = useState(false);

  const [keyTakeaways, setKeyTakeaways] = useState(null); // State for key takeaways
  const [isGeneratingKeyTakeaways, setIsGeneratingKeyTakeaways] = useState(false);
  const [keyTakeawaysError, setKeyTakeawaysError] = useState('');
  const [showKeyTakeaways, setShowKeyTakeaways] = useState(false);

  const [rephrasedText, setRephrasedText] = useState(''); // State for rephrased text
  const [isRephrasingText, setIsRephrasingText] = useState(false);
  const [rephraseError, setRephraseError] = useState('');
  const [showRephrasedText, setShowRephrasedText] = useState(false);

  const [translatedText, setTranslatedText] = useState(''); // State for translated text
  const [isTranslatingText, setIsTranslatingText] = useState(false);
  const [translateError, setTranslateError] = useState('');
  const [showTranslatedText, setShowTranslatedText] = useState(false);

  const [sentimentAnalysis, setSentimentAnalysis] = useState(null); // New state for sentiment
  const [isAnalyzingSentiment, setIsAnalyzingSentiment] = useState(false);
  const [sentimentError, setSentimentError] = useState('');
  const [showSentiment, setShowSentiment] = useState(false);

  const [contextualInfo, setContextualInfo] = useState(''); // New state for contextual info
  const [isGettingContextualInfo, setIsGettingContextualInfo] = useState(false);
  const [contextualInfoError, setContextualInfoError] = useState('');
  const [showContextualInfo, setShowContextualInfo] = useState(false);

  // Firestore states
  const [firebaseDb, setFirebaseDb] = useState(null);
  const [firebaseAuth, setFirebaseAuth] = useState(null);
  const [appUserId, setAppUserId] = useState(null);
  const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-synapse-read-app'; // Use provided __app_id or default


  // Initialize Firebase and authenticate
  useEffect(() => {
    const initFirebase = async () => {
      const { db, auth, userId } = await firebaseInitializeAndAuth(JSON.parse(__firebase_config), appId);
      setFirebaseDb(db);
      setFirebaseAuth(auth);
      setAppUserId(userId);
    };
    initFirebase();
  }, [appId]); // Depend on appId

  // Callback for when a file's content is successfully loaded.
  const handleFileLoaded = useCallback((content) => {
    setFileContent(content);
    // Clear all previous LLM results when a new file is loaded
    setSummary('');
    setSummaryError('');
    setShowSummary(false);
    setExplanation('');
    setExplanationError('');
    setShowExplanation(false);
    setVocabulary(null);
    setVocabularyError('');
    setShowVocabulary(false);
    setStudyQuestions(null);
    setStudyQuestionsError('');
    setShowStudyQuestions(false);
    setSimplifiedText('');
    setSimplifyError('');
    setShowSimplifiedText(false);
    setFaqAnswers(null);
    setFaqError('');
    setShowFaq(false);
    setKeyTakeaways(null);
    setKeyTakeawaysError('');
    setShowKeyTakeaways(false);
    setRephrasedText('');
    setRephraseError('');
    setShowRephrasedText(false);
    setTranslatedText('');
    setTranslateError('');
    setShowTranslatedText(false);
    setSentimentAnalysis(null); // Clear new sentiment state
    setSentimentError('');
    setShowSentiment(false);
    setContextualInfo(''); // Clear new contextual info state
    setContextualInfoError('');
    setShowContextualInfo(false);
  }, []);

  // Callback for when settings are changed.
  const handleSettingsChange = useCallback((newSettings) => {
    setSettings(newSettings);
  }, []);

  // Callback to update the security status.
  const handleSecurityStatus = useCallback((isSecure, errors) => {
    setSecurityStatus({ isSecure, errors });
  }, []);

  // Callback to receive reading progress updates from EnhancedReader.
  const handleReadingProgress = useCallback((progress) => {
    setReadingProgress(progress);
  }, []);

  // Handler for logging errors from ErrorBoundary
  const handleLogError = useCallback((errorDetails) => {
    if (firebaseDb && appUserId) {
      logErrorToFirestore(errorDetails, appUserId, appId);
    } else {
      console.warn("Firestore not ready for logging. Error details:", errorDetails);
    }
  }, [firebaseDb, appUserId, appId]);

  // --- LLM Powered Summarization Feature ---
  const handleSummarizeText = useCallback(async () => {
    if (!fileContent) {
      setSummaryError("Please upload a document first to summarize.");
      return;
    }
    
    // Clear previous summary and errors
    setSummary('');
    setSummaryError('');
    setIsSummarizing(true);
    setShowSummary(true); // Show summary section while loading

    try {
      const prompt = `Summarize the following text concisely and accurately. Focus on the main points and key information. Ensure the summary is easy to understand and flows well:\n\n"${fileContent}"`;
      
      const chatHistory = [{ role: "user", parts: [{ text: prompt }] }];
      const payload = { contents: chatHistory };
      const apiKey = ""; // Canvas will provide this at runtime if left empty
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      console.log("Calling Gemini API for summarization...");
      const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
      });

      if (!response.ok) {
          const errorData = await response.json();
          throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorData.error?.message || 'Unknown error'}`);
      }

      const result = await response.json();
      
      if (result.candidates && result.candidates.length > 0 &&
          result.candidates[0].content && result.candidates[0].content.parts &&
          result.candidates[0].content.parts.length > 0) {
        const generatedText = result.candidates[0].content.parts[0].text;
        setSummary(generatedText);
        console.log("Summary generated successfully.");
      } else {
        throw new Error("No summary content received from the API.");
      }
    } catch (error) {
      console.error("Error summarizing text:", error);
      setSummaryError(`Failed to generate summary: ${error.message}. Please try again.`);
      setSummary(''); // Clear any partial summary
    } finally {
      setIsSummarizing(false);
    }
  }, [fileContent]); // Dependency on fileContent

  // --- LLM Powered Explanation Feature ---
  const handleExplainSelection = useCallback(async (textToExplain) => {
    if (!textToExplain) {
      setExplanationError("No text selected for explanation.");
      return;
    }
    
    // Clear previous explanation and errors
    setExplanation('');
    setExplanationError('');
    setIsExplaining(true);
    setShowExplanation(true); // Show explanation section while loading

    try {
      const prompt = `Explain the following text or concept in simple, easy-to-understand terms, suitable for someone with reading difficulties. Keep it concise:\n\n"${textToExplain}"`;
      let chatHistory = [];
      chatHistory.push({ role: "user", parts: [{ text: prompt }] });
      const payload = { contents: chatHistory };
      const apiKey = ""; // Canvas will provide this at runtime if left empty
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      console.log("Calling Gemini API for explanation...");
      const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
      });

      if (!response.ok) {
          const errorData = await response.json();
          throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorData.error?.message || 'Unknown error'}`);
      }

      const result = await response.json();
      if (result.candidates && result.candidates.length > 0 &&
          result.candidates[0].content && result.candidates[0].content.parts &&
          result.candidates[0].content.parts.length > 0) {
        const generatedText = result.candidates[0].content.parts[0].text;
        setExplanation(generatedText);
        console.log("Explanation generated successfully.");
      } else {
        throw new Error("No explanation content received from the API.");
      }
    } catch (error) {
      console.error("Error explaining text:", error);
      setExplanationError(`Failed to get explanation: ${error.message}. Please try again.`);
      setExplanation(''); // Clear any partial explanation
    } finally {
      setIsExplaining(false);
    }
  }, []); // No dependencies for now as it uses local state and parameters

  // --- LLM Powered Vocabulary Builder Feature ---
  const handleBuildVocabulary = useCallback(async (wordToLookup) => {
    if (!wordToLookup) {
      setVocabularyError("No word selected for vocabulary lookup.");
      return;
    }

    setVocabulary(null);
    setVocabularyError('');
    setIsBuildingVocabulary(true);
    setShowVocabulary(true);

    try {
      // Use a structured prompt to get JSON output
      const prompt = `Provide definition, 3 synonyms, 3 antonyms (if applicable), and 2 example sentences for the word "${wordToLookup}". Format the output as a JSON object with keys: "word", "definition", "synonyms" (array of strings), "antonyms" (array of strings, can be empty), "examples" (array of strings).`;
      
      let chatHistory = [];
      chatHistory.push({ role: "user", parts: [{ text: prompt }] });
      const payload = {
        contents: chatHistory,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              "word": { "type": "STRING" },
              "definition": { "type": "STRING" },
              "synonyms": {
                "type": "ARRAY",
                "items": { "type": "STRING" }
              },
              "antonyms": {
                "type": "ARRAY",
                "items": { "type": "STRING" }
              },
              "examples": {
                "type": "ARRAY",
                "items": { "type": "STRING" }
              }
            },
            "propertyOrdering": ["word", "definition", "synonyms", "antonyms", "examples"]
          }
        }
      };
      
      const apiKey = "";
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      console.log("Calling Gemini API for vocabulary...");
      const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
      });

      if (!response.ok) {
          const errorData = await response.json();
          throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorData.error?.message || 'Unknown error'}`);
      }

      const result = await response.json();
      
      if (result.candidates && result.candidates.length > 0 &&
          result.candidates[0].content && result.candidates[0].content.parts &&
          result.candidates[0].content.parts.length > 0) {
        const jsonString = result.candidates[0].content.parts[0].text;
        const parsedVocabulary = JSON.parse(jsonString);
        setVocabulary(parsedVocabulary);
        console.log("Vocabulary generated successfully:", parsedVocabulary);
      } else {
        throw new Error("No vocabulary content received from the API.");
      }
    } catch (error) {
      console.error("Error building vocabulary:", error);
      setVocabularyError(`Failed to build vocabulary: ${error.message}. Please try again.`);
      setVocabulary(null);
    } finally {
      setIsBuildingVocabulary(false);
    }
  }, []);

  // --- LLM Powered Study Questions Feature ---
  const handleGenerateStudyQuestions = useCallback(async (textToGenerateQuestionsFrom) => {
    if (!textToGenerateQuestionsFrom) {
      setStudyQuestionsError("No text selected to generate study questions from.");
      return;
    }

    setStudyQuestions(null);
    setStudyQuestionsError('');
    setIsGeneratingStudyQuestions(true);
    setShowStudyQuestions(true);

    try {
      const prompt = `Generate 3-5 study questions (mix of multiple choice and open-ended) based on the following text. For multiple-choice questions, provide 3 options (A, B, C) and indicate the correct answer. Format the output as a JSON array of objects. Each object should have a "type" (either "multiple-choice" or "open-ended"), a "question" string. If "multiple-choice", include "options" (array of strings) and "correctAnswer" (string). If "open-ended", omit options and correctAnswer. Example: [{"type": "multiple-choice", "question": "What is...", "options": ["A:...", "B:...", "C:..."], "correctAnswer": "A:..."}, {"type": "open-ended", "question": "Explain..."}]:\n\n"${textToGenerateQuestionsFrom}"`;
      
      let chatHistory = [];
      chatHistory.push({ role: "user", parts: [{ text: prompt }] });
      const payload = {
        contents: chatHistory,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                "type": { "type": "STRING", "enum": ["multiple-choice", "open-ended"] },
                "question": { "type": "STRING" },
                "options": {
                  "type": "ARRAY",
                  "items": { "type": "STRING" }
                },
                "correctAnswer": { "type": "STRING" }
              },
              "required": ["type", "question"]
            }
          }
        }
      };
      
      const apiKey = "";
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      console.log("Calling Gemini API for study questions...");
      const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
      });

      if (!response.ok) {
          const errorData = await response.json();
          throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorData.error?.message || 'Unknown error'}`);
      }

      const result = await response.json();
      
      if (result.candidates && result.candidates.length > 0 &&
          result.candidates[0].content && result.candidates[0].content.parts &&
          result.candidates[0].content.parts.length > 0) {
        const jsonString = result.candidates[0].content.parts[0].text;
        const parsedQuestions = JSON.parse(jsonString);
        setStudyQuestions(parsedQuestions);
        console.log("Study questions generated successfully:", parsedQuestions);
      } else {
        throw new Error("No study questions content received from the API.");
      }
    } catch (error) {
      console.error("Error generating study questions:", error);
      setStudyQuestionsError(`Failed to generate study questions: ${error.message}. Please try again.`);
      setStudyQuestions(null);
    } finally {
      setIsGeneratingStudyQuestions(false);
    }
  }, []);

  // --- LLM Powered Simplify Text Feature ---
  const handleSimplifyText = useCallback(async (textToSimplify) => {
    if (!textToSimplify) {
      setSimplifyError("No text selected for simplification.");
      return;
    }

    setSimplifiedText('');
    setSimplifyError('');
    setIsSimplifying(true);
    setShowSimplifiedText(true);

    try {
      const prompt = `Simplify the following text, making it easier to read and understand for someone with reading difficulties like dyslexia or ADHD. Keep the core meaning intact but use simpler vocabulary and sentence structures:\n\n"${textToSimplify}"`;
      
      let chatHistory = [];
      chatHistory.push({ role: "user", parts: [{ text: prompt }] });
      const payload = { contents: chatHistory };
      const apiKey = ""; // Canvas will provide this at runtime if left empty
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      console.log("Calling Gemini API for text simplification...");
      const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
      });

      if (!response.ok) {
          const errorData = await response.json();
          throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorData.error?.message || 'Unknown error'}`);
      }

      const result = await response.json();
      
      if (result.candidates && result.candidates.length > 0 &&
          result.candidates[0].content && result.candidates[0].content.parts &&
          result.candidates[0].content.parts.length > 0) {
        const generatedText = result.candidates[0].content.parts[0].text;
        setSimplifiedText(generatedText);
        console.log("Text simplified successfully.");
      } else {
        throw new Error("No simplified text content received from the API.");
      }
    } catch (error) {
      console.error("Error simplifying text:", error);
      setSimplifyError(`Failed to simplify text: ${error.message}. Please try again.`);
      setSimplifiedText(''); // Clear any partial simplified text
    } finally {
      setIsSimplifying(false);
    }
  }, []);

  // --- LLM Powered FAQ Feature ---
  const handleGenerateFAQ = useCallback(async () => {
    if (!fileContent) {
      setFaqError("Please upload a document first to generate FAQs.");
      return;
    }

    setFaqAnswers(null);
    setFaqError('');
    setIsAnsweringFaq(true);
    setShowFaq(true);

    try {
      const prompt = `Based on the following document, generate 3-5 frequently asked questions (FAQs) and their concise answers. Focus on key information and common queries a user might have after reading the text. Format the output as a JSON array of objects, each with a "question" string and an "answer" string. Example: [{"question": "What is...", "answer": "It is..."}, {"question": "How does...", "answer": "It works by..."}]:\n\n"${fileContent}"`;
      
      let chatHistory = [];
      chatHistory.push({ role: "user", parts: [{ text: prompt }] });
      const payload = {
        contents: chatHistory,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                "question": { "type": "STRING" },
                "answer": { "type": "STRING" }
              },
              "required": ["question", "answer"]
            }
          }
        }
      };
      
      const apiKey = "";
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      console.log("Calling Gemini API for FAQ generation...");
      const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
      });

      if (!response.ok) {
          const errorData = await response.json();
          throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorData.error?.message || 'Unknown error'}`);
      }

      const result = await response.json();
      
      if (result.candidates && result.candidates.length > 0 &&
          result.candidates[0].content && result.candidates[0].content.parts &&
          result.candidates[0].content.parts.length > 0) {
        const jsonString = result.candidates[0].content.parts[0].text;
        const parsedFaq = JSON.parse(jsonString);
        setFaqAnswers(parsedFaq);
        console.log("FAQ generated successfully:", parsedFaq);
      } else {
        throw new Error("No FAQ content received from the API.");
      }
    } catch (error) {
      console.error("Error generating FAQ:", error);
      setFaqError(`Failed to generate FAQ: ${error.message}. Please try again.`);
      setFaqAnswers(null);
    } finally {
      setIsAnsweringFaq(false);
    }
  }, [fileContent]);

  // --- LLM Powered Key Takeaways Feature ---
  const handleGenerateKeyTakeaways = useCallback(async () => {
    if (!fileContent) {
      setKeyTakeawaysError("Please upload a document first to generate key takeaways.");
      return;
    }

    setKeyTakeaways(null);
    setKeyTakeawaysError('');
    setIsGeneratingKeyTakeaways(true);
    setShowKeyTakeaways(true);

    try {
      const prompt = `From the following text, extract 3-5 crucial key takeaways or actionable insights. Present them as a concise bulleted list:\n\n"${fileContent}"`;
      
      let chatHistory = [];
      chatHistory.push({ role: "user", parts: [{ text: prompt }] });
      const payload = {
        contents: chatHistory,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "ARRAY",
            items: { "type": "STRING" }
          }
        }
      };
      
      const apiKey = "";
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      console.log("Calling Gemini API for key takeaways...");
      const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
      });

      if (!response.ok) {
          const errorData = await response.json();
          throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorData.error?.message || 'Unknown error'}`);
      }

      const result = await response.json();
      
      if (result.candidates && result.candidates.length > 0 &&
          result.candidates[0].content && result.candidates[0].content.parts &&
          result.candidates[0].content.parts.length > 0) {
        const jsonString = result.candidates[0].content.parts[0].text;
        const parsedTakeaways = JSON.parse(jsonString);
        setKeyTakeaways(parsedTakeaways);
        console.log("Key takeaways generated successfully:", parsedTakeaways);
      } else {
        throw new Error("No key takeaways content received from the API.");
      }
    } catch (error) {
      console.error("Error generating key takeaways:", error);
      setKeyTakeawaysError(`Failed to generate key takeaways: ${error.message}. Please try again.`);
      setKeyTakeaways(null);
    } finally {
      setIsGeneratingKeyTakeaways(false);
    }
  }, [fileContent]);

  // --- LLM Powered Rephrase Selected Text Feature ---
  const handleRephraseSelectedText = useCallback(async (textToRephrase) => {
    if (!textToRephrase) {
      setRephraseError("No text selected to rephrase.");
      return;
    }

    setRephrasedText('');
    setRephraseError('');
    setIsRephrasingText(true);
    setShowRephrasedText(true);

    try {
      const prompt = `Rephrase the following text. Make it more clear and concise without losing its original meaning:\n\n"${textToRephrase}"`;
      
      let chatHistory = [];
      chatHistory.push({ role: "user", parts: [{ text: prompt }] });
      const payload = { contents: chatHistory };
      const apiKey = "";
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      console.log("Calling Gemini API for rephrasing...");
      const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
      });

      if (!response.ok) {
          const errorData = await response.json();
          throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorData.error?.message || 'Unknown error'}`);
      }

      const result = await response.json();
      
      if (result.candidates && result.candidates.length > 0 &&
          result.candidates[0].content && result.candidates[0].content.parts &&
          result.candidates[0].content.parts.length > 0) {
        const generatedText = result.candidates[0].content.parts[0].text;
        setRephrasedText(generatedText);
        console.log("Text rephrased successfully.");
      } else {
        throw new Error("No rephrased content received from the API.");
      }
    } catch (error) {
      console.error("Error rephrasing text:", error);
      setRephraseError(`Failed to rephrase text: ${error.message}. Please try again.`);
      setRephrasedText('');
    } finally {
      setIsRephrasingText(false);
    }
  }, []);

  // --- LLM Powered Translate Selected Text Feature ---
  const handleTranslateSelectedText = useCallback(async (textToTranslate) => {
    if (!textToTranslate) {
      setTranslateError("No text selected to translate.");
      return;
    }

    const targetLanguage = prompt("Enter target language (e.g., 'French', 'Spanish', 'German'):");
    if (!targetLanguage) {
      setTranslateError("Translation cancelled. Please enter a target language.");
      return;
    }

    setTranslatedText('');
    setTranslateError('');
    setIsTranslatingText(true);
    setShowTranslatedText(true);

    try {
      const prompt = `Translate the following English text into ${targetLanguage}:\n\n"${textToTranslate}"`;
      
      let chatHistory = [];
      chatHistory.push({ role: "user", parts: [{ text: prompt }] });
      const payload = { contents: chatHistory };
      const apiKey = "";
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      console.log("Calling Gemini API for translation...");
      const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
      });

      if (!response.ok) {
          const errorData = await response.json();
          throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorData.error?.message || 'Unknown error'}`);
      }

      const result = await response.json();
      
      if (result.candidates && result.candidates.length > 0 &&
          result.candidates[0].content && result.candidates[0].content.parts &&
          result.candidates[0].content.parts.length > 0) {
        const generatedText = result.candidates[0].content.parts[0].text;
        setTranslatedText(generatedText);
        console.log("Text translated successfully.");
      } else {
        throw new Error("No translated content received from the API.");
      }
    } catch (error) {
      console.error("Error translating text:", error);
      setTranslateError(`Failed to translate text: ${error.message}. Please try again.`);
      setTranslatedText('');
    } finally {
      setIsTranslatingText(false);
    }
  }, []);

  // --- LLM Powered Sentiment Analysis Feature ---
  const handleAnalyzeSentiment = useCallback(async (textToAnalyze) => {
    if (!textToAnalyze) {
      setSentimentError("No text selected for sentiment analysis.");
      return;
    }

    setSentimentAnalysis(null);
    setSentimentError('');
    setIsAnalyzingSentiment(true);
    setShowSentiment(true);

    try {
      const prompt = `Analyze the dominant sentiment (e.g., positive, negative, neutral, argumentative, informative, persuasive, critical, humorous) and tone of the following text: "${textToAnalyze}". Explain why you chose that sentiment/tone with a brief justification. Format the output as a JSON object with keys: "sentiment", "justification".`;
      
      let chatHistory = [];
      chatHistory.push({ role: "user", parts: [{ text: prompt }] });
      const payload = {
        contents: chatHistory,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              "sentiment": { "type": "STRING" },
              "justification": { "type": "STRING" }
            },
            "required": ["sentiment", "justification"]
          }
        }
      };
      
      const apiKey = "";
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      console.log("Calling Gemini API for sentiment analysis...");
      const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
      });

      if (!response.ok) {
          const errorData = await response.json();
          throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorData.error?.message || 'Unknown error'}`);
      }

      const result = await response.json();
      
      if (result.candidates && result.candidates.length > 0 &&
          result.candidates[0].content && result.candidates[0].content.parts &&
          result.candidates[0].content.parts.length > 0) {
        const jsonString = result.candidates[0].content.parts[0].text;
        const parsedSentiment = JSON.parse(jsonString);
        setSentimentAnalysis(parsedSentiment);
        console.log("Sentiment analysis generated successfully:", parsedSentiment);
      } else {
        throw new Error("No sentiment analysis content received from the API.");
      }
    } catch (error) {
      console.error("Error analyzing sentiment:", error);
      setSentimentError(`Failed to analyze sentiment: ${error.message}. Please try again.`);
      setSentimentAnalysis(null);
    } finally {
      setIsAnalyzingSentiment(false);
    }
  }, []);

  // --- LLM Powered Contextual Background Information Feature ---
  const handleGetContextualInfo = useCallback(async (selectedTerm) => {
    if (!selectedTerm) {
      setContextualInfoError("No term selected for contextual information.");
      return;
    }

    setContextualInfo('');
    setContextualInfoError('');
    setIsGettingContextualInfo(true);
    setShowContextualInfo(true);

    try {
      const prompt = `Provide concise background information for the term or concept: "${selectedTerm}". Focus on its relevance and general context, assuming the user might not be familiar with it, but don't re-summarize the provided document. Keep it brief, no more than 3-4 sentences.`;
      
      let chatHistory = [];
      chatHistory.push({ role: "user", parts: [{ text: prompt }] });
      const payload = { contents: chatHistory };
      const apiKey = "";
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      console.log("Calling Gemini API for contextual info...");
      const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
      });

      if (!response.ok) {
          const errorData = await response.json();
          throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorData.error?.message || 'Unknown error'}`);
      }

      const result = await response.json();
      
      if (result.candidates && result.candidates.length > 0 &&
          result.candidates[0].content && result.candidates[0].content.parts &&
          result.candidates[0].content.parts.length > 0) {
        const generatedText = result.candidates[0].content.parts[0].text;
        setContextualInfo(generatedText);
        console.log("Contextual info generated successfully.");
      } else {
        throw new Error("No contextual information content received from the API.");
      }
    } catch (error) {
      console.error("Error getting contextual info:", error);
      setContextualInfoError(`Failed to get contextual information: ${error.message}. Please try again.`);
      setContextualInfo('');
    } finally {
      setIsGettingContextualInfo(false);
    }
  }, []);

  return (
    // Wrap the entire application with the ErrorBoundary
    <ErrorBoundary onErrorLogged={handleLogError}> {/* Pass the error logging handler */}
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4 sm:p-6 lg:p-8 font-inter">
        <div className="max-w-7xl mx-auto space-y-6 lg:space-y-8">
          {/* Header Section */}
          <header className="text-center py-6 sm:py-8 lg:py-10">
            <div className="flex items-center justify-center gap-3 sm:gap-4 mb-3 sm:mb-4">
              <div className="p-2 sm:p-3 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl shadow-lg transform rotate-6">
                <Eye className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent drop-shadow-md">
                SynapseRead
              </h1>
            </div>
            <p className="text-base sm:text-xl text-gray-600 max-w-xl sm:max-w-2xl mx-auto leading-relaxed">
              Enterprise-grade Enhanced Reading technology designed to enhance focus
              and comprehension for individuals with ADHD and dyslexia.
            </p>
          </header>

          {/* Security Status Display */}
          <SecurityStatus
            isSecure={securityStatus.isSecure}
            errors={securityStatus.errors}
          />

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 lg:gap-8">
            {/* Left Column - Controls (File Importer and Settings) */}
            <div className="xl:col-span-1 space-y-6 lg:space-y-8">
              <SecureFileImporter
                onFileLoaded={handleFileLoaded}
                onSecurityStatus={handleSecurityStatus}
              />
              <EnhancedSettings
                settings={settings}
                onSettingsChange={handleSettingsChange}
              />
               {/* Error Log Viewer Section */}
              <ErrorLogViewer
                userId={appUserId}
                db={firebaseDb}
                appId={appId}
                onToggleVisibility={(isVisible) => console.log('Error logs visibility toggled:', isVisible)}
              />
            </div>

            {/* Right Column - Enhanced Reader Display */}
            <div className="xl:col-span-2">
              {fileContent && securityStatus.isSecure ? (
                <>
                  <EnhancedReader
                    text={fileContent}
                    settings={settings}
                    onProgress={handleReadingProgress}
                    onSummarize={handleSummarizeText} // Pass the summarization handler
                    onExplainSelection={handleExplainSelection} // Pass the explanation handler
                    onBuildVocabulary={handleBuildVocabulary} // Pass the vocabulary handler
                    onGenerateStudyQuestions={handleGenerateStudyQuestions} // Pass the study questions handler
                    onSimplifyText={handleSimplifyText} // Pass the simplify text handler
                    onRephraseSelectedText={handleRephraseSelectedText} // Pass rephrase handler
                    onTranslateSelectedText={handleTranslateSelectedText} // Pass translate handler
                    onAnalyzeSentiment={handleAnalyzeSentiment} // Pass new sentiment handler
                    onGetContextualInfo={handleGetContextualInfo} // Pass new contextual info handler
                  />

                  {/* New LLM Feature Buttons (Document-level) */}
                  <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4 mt-6">
                      {fileContent && (
                          <button
                              onClick={handleGenerateFAQ}
                              className="flex items-center justify-center gap-2 px-6 py-3 bg-purple-800 text-white rounded-lg hover:bg-purple-900 transition-all duration-300 shadow-md transform hover:scale-[1.02]
                                         focus:outline-none focus:ring-2 focus:ring-purple-700 focus:ring-opacity-50"
                          >
                              <MessageSquare className="w-5 h-5" />
                              Generate FAQs ✨
                          </button>
                      )}
                      {fileContent && (
                          <button
                              onClick={handleGenerateKeyTakeaways}
                              className="flex items-center justify-center gap-2 px-6 py-3 bg-fuchsia-600 text-white rounded-lg hover:bg-fuchsia-700 transition-all duration-300 shadow-md transform hover:scale-[1.02]
                                         focus:outline-none focus:ring-2 focus:ring-fuchsia-500 focus:ring-opacity-50"
                          >
                              <List className="w-5 h-5" />
                              Key Takeaways ✨
                          </button>
                      )}
                  </div>


                  {/* Summary Section */}
                  {showSummary && (summary || isSummarizing || summaryError) && (
                    <div className="mt-6 bg-white p-6 rounded-lg border shadow-xl">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                          <Lightbulb className="w-5 h-5 text-purple-600" />
                          Document Summary
                        </h3>
                        <button
                          onClick={() => setShowSummary(false)}
                          className="text-gray-500 hover:text-gray-700 text-sm font-medium"
                        >
                          Hide
                        </button>
                      </div>
                      {isSummarizing ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="w-6 h-6 text-purple-500 animate-spin mr-2" />
                          <span className="text-gray-600">Generating summary...</span>
                        </div>
                      ) : summaryError ? (
                        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
                          <AlertTriangle className="inline w-4 h-4 mr-2" />
                          {summaryError}
                        </div>
                      ) : (
                        <p className="text-gray-700 whitespace-pre-wrap">{summary}</p>
                      )}
                    </div>
                  )}

                  {/* Explanation Section */}
                  {showExplanation && (explanation || isExplaining || explanationError) && (
                    <div className="mt-6 bg-white p-6 rounded-lg border shadow-xl">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                          <Lightbulb className="w-5 h-5 text-indigo-600" />
                          Explanation
                        </h3>
                        <button
                          onClick={() => setShowExplanation(false)}
                          className="text-gray-500 hover:text-gray-700 text-sm font-medium"
                        >
                          Hide
                        </button>
                      </div>
                      {isExplaining ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="w-6 h-6 text-indigo-500 animate-spin mr-2" />
                          <span className="text-gray-600">Generating explanation...</span>
                        </div>
                      ) : explanationError ? (
                        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
                          <AlertTriangle className="inline w-4 h-4 mr-2" />
                          {explanationError}
                        </div>
                      ) : (
                        <p className="text-gray-700 whitespace-pre-wrap">{explanation}</p>
                      )}
                    </div>
                  )}

                  {/* Vocabulary Section */}
                  {showVocabulary && (vocabulary || isBuildingVocabulary || vocabularyError) && (
                    <div className="mt-6 bg-white p-6 rounded-lg border shadow-xl">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                          <GraduationCap className="w-5 h-5 text-teal-600" />
                          Vocabulary Builder
                        </h3>
                        <button
                          onClick={() => setShowVocabulary(false)}
                          className="text-gray-500 hover:text-gray-700 text-sm font-medium"
                        >
                          Hide
                        </button>
                      </div>
                      {isBuildingVocabulary ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="w-6 h-6 text-teal-500 animate-spin mr-2" />
                          <span className="text-gray-600">Building vocabulary...</span>
                        </div>
                      ) : vocabularyError ? (
                        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
                          <AlertTriangle className="inline w-4 h-4 mr-2" />
                          {vocabularyError}
                        </div>
                      ) : (
                        vocabulary && (
                          <div className="space-y-4">
                            <div>
                              <p className="text-gray-800 font-bold text-lg mb-1">{vocabulary.word}</p>
                              <p className="text-gray-700"><span className="font-semibold">Definition:</span> {vocabulary.definition}</p>
                            </div>
                            {vocabulary.synonyms && vocabulary.synonyms.length > 0 && (
                              <div>
                                <p className="font-semibold text-gray-700">Synonyms:</p>
                                <ul className="list-disc list-inside text-gray-600 text-sm">
                                  {vocabulary.synonyms.map((syn, idx) => <li key={idx}>{syn}</li>)}
                                </ul>
                              </div>
                            )}
                            {vocabulary.antonyms && vocabulary.antonyms.length > 0 && (
                              <div>
                                <p className="font-semibold text-gray-700">Antonyms:</p>
                                <ul className="list-disc list-inside text-gray-600 text-sm">
                                  {vocabulary.antonyms.map((ant, idx) => <li key={idx}>{ant}</li>)}
                                </ul>
                              </div>
                            )}
                            {vocabulary.examples && vocabulary.examples.length > 0 && (
                              <div>
                                <p className="font-semibold text-gray-700">Examples:</p>
                                <ul className="list-disc list-inside text-gray-600 text-sm">
                                  {vocabulary.examples.map((ex, idx) => <li key={idx}>{ex}</li>)}
                                </ul>
                              </div>
                            )}
                          </div>
                        )
                      )}
                    </div>
                  )}

                  {/* Study Questions Section */}
                  {showStudyQuestions && (studyQuestions || isGeneratingStudyQuestions || studyQuestionsError) && (
                    <div className="mt-6 bg-white p-6 rounded-lg border shadow-xl">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                          <HelpCircle className="w-5 h-5 text-blue-800" />
                          Study Questions
                        </h3>
                        <button
                          onClick={() => setShowStudyQuestions(false)}
                          className="text-gray-500 hover:text-gray-700 text-sm font-medium"
                        >
                          Hide
                        </button>
                      </div>
                      {isGeneratingStudyQuestions ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="w-6 h-6 text-blue-800 animate-spin mr-2" />
                          <span className="text-gray-600">Generating study questions...</span>
                        </div>
                      ) : studyQuestionsError ? (
                        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
                          <AlertTriangle className="inline w-4 h-4 mr-2" />
                          {studyQuestionsError}
                        </div>
                      ) : (
                        studyQuestions && studyQuestions.length > 0 ? (
                          <div className="space-y-6">
                            {studyQuestions.map((q, qIdx) => (
                              <div key={qIdx} className="p-4 border rounded-lg bg-gray-50">
                                <p className="font-semibold text-gray-800 mb-2">Q{qIdx + 1}: {q.question}</p>
                                {q.type === "multiple-choice" && q.options && q.options.length > 0 && (
                                  <div className="space-y-1">
                                    {q.options.map((option, optIdx) => (
                                      <p key={optIdx} className="text-gray-700 text-sm ml-2">
                                        {option}
                                      </p>
                                    ))}
                                    {q.correctAnswer && (
                                      <p className="font-semibold text-green-700 text-sm mt-2">
                                        Correct Answer: {q.correctAnswer}
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-gray-500 text-center py-4">No study questions generated.</p>
                        )
                      )}
                    </div>
                  )}

                  {/* Simplified Text Section */}
                  {showSimplifiedText && (simplifiedText || isSimplifying || simplifyError) && (
                    <div className="mt-6 bg-white p-6 rounded-lg border shadow-xl">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                          <Lightbulb className="w-5 h-5 text-green-600" />
                          Simplified Text
                        </h3>
                        <button
                          onClick={() => setShowSimplifiedText(false)}
                          className="text-gray-500 hover:text-gray-700 text-sm font-medium"
                        >
                          Hide
                        </button>
                      </div>
                      {isSimplifying ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="w-6 h-6 text-green-500 animate-spin mr-2" />
                          <span className="text-gray-600">Simplifying text...</span>
                        </div>
                      ) : simplifyError ? (
                        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
                          <AlertTriangle className="inline w-4 h-4 mr-2" />
                          {simplifyError}
                        </div>
                      ) : (
                        <p className="text-gray-700 whitespace-pre-wrap">{simplifiedText}</p>
                      )}
                    </div>
                  )}

                  {/* Rephrased Text Section */}
                  {showRephrasedText && (rephrasedText || isRephrasingText || rephraseError) && (
                    <div className="mt-6 bg-white p-6 rounded-lg border shadow-xl">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                          <Shuffle className="w-5 h-5 text-orange-600" />
                          Rephrased Text
                        </h3>
                        <button
                          onClick={() => setShowRephrasedText(false)}
                          className="text-gray-500 hover:text-gray-700 text-sm font-medium"
                        >
                          Hide
                        </button>
                      </div>
                      {isRephrasingText ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="w-6 h-6 text-orange-500 animate-spin mr-2" />
                          <span className="text-gray-600">Rephrasing text...</span>
                        </div>
                      ) : rephraseError ? (
                        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
                          <AlertTriangle className="inline w-4 h-4 mr-2" />
                          {rephraseError}
                        </div>
                      ) : (
                        <p className="text-gray-700 whitespace-pre-wrap">{rephrasedText}</p>
                      )}
                    </div>
                  )}

                  {/* Translated Text Section */}
                  {showTranslatedText && (translatedText || isTranslatingText || translateError) && (
                    <div className="mt-6 bg-white p-6 rounded-lg border shadow-xl">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                          <Languages className="w-5 h-5 text-pink-600" />
                          Translated Text
                        </h3>
                        <button
                          onClick={() => setShowTranslatedText(false)}
                          className="text-gray-500 hover:text-gray-700 text-sm font-medium"
                        >
                          Hide
                        </button>
                      </div>
                      {isTranslatingText ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="w-6 h-6 text-pink-500 animate-spin mr-2" />
                          <span className="text-gray-600">Translating text...</span>
                        </div>
                      ) : translateError ? (
                        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
                          <AlertTriangle className="inline w-4 h-4 mr-2" />
                          {translateError}
                        </div>
                      ) : (
                        <p className="text-gray-700 whitespace-pre-wrap">{translatedText}</p>
                      )}
                    </div>
                  )}

                  {/* Sentiment Analysis Section */}
                  {showSentiment && (sentimentAnalysis || isAnalyzingSentiment || sentimentError) && (
                    <div className="mt-6 bg-white p-6 rounded-lg border shadow-xl">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                          <Smile className="w-5 h-5 text-yellow-600" />
                          Sentiment/Tone Analysis
                        </h3>
                        <button
                          onClick={() => setShowSentiment(false)}
                          className="text-gray-500 hover:text-gray-700 text-sm font-medium"
                        >
                          Hide
                        </button>
                      </div>
                      {isAnalyzingSentiment ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="w-6 h-6 text-yellow-500 animate-spin mr-2" />
                          <span className="text-gray-600">Analyzing sentiment...</span>
                        </div>
                      ) : sentimentError ? (
                        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
                          <AlertTriangle className="inline w-4 h-4 mr-2" />
                          {sentimentError}
                        </div>
                      ) : (
                        sentimentAnalysis && (
                          <div className="space-y-2">
                            <p className="text-gray-800"><span className="font-semibold">Dominant Sentiment/Tone:</span> <span className="capitalize">{sentimentAnalysis.sentiment}</span></p>
                            <p className="text-gray-700"><span className="font-semibold">Justification:</span> {sentimentAnalysis.justification}</p>
                          </div>
                        )
                      )}
                    </div>
                  )}

                  {/* Contextual Information Section */}
                  {showContextualInfo && (contextualInfo || isGettingContextualInfo || contextualInfoError) && (
                    <div className="mt-6 bg-white p-6 rounded-lg border shadow-xl">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                          <Info className="w-5 h-5 text-cyan-600" />
                          Contextual Information
                        </h3>
                        <button
                          onClick={() => setShowContextualInfo(false)}
                          className="text-gray-500 hover:text-gray-700 text-sm font-medium"
                        >
                          Hide
                        </button>
                      </div>
                      {isGettingContextualInfo ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="w-6 h-6 text-cyan-500 animate-spin mr-2" />
                          <span className="text-gray-600">Getting contextual information...</span>
                        </div>
                      ) : contextualInfoError ? (
                        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
                          <AlertTriangle className="inline w-4 h-4 mr-2" />
                          {contextualInfoError}
                        </div>
                      ) : (
                        <p className="text-gray-700 whitespace-pre-wrap">{contextualInfo}</p>
                      )}
                    </div>
                  )}

                  {/* FAQ Section */}
                  {showFaq && (faqAnswers || isAnsweringFaq || faqError) && (
                    <div className="mt-6 bg-white p-6 rounded-lg border shadow-xl">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                          <MessageSquare className="w-5 h-5 text-purple-800" />
                          Frequently Asked Questions
                        </h3>
                        <button
                          onClick={() => setShowFaq(false)}
                          className="text-gray-500 hover:text-gray-700 text-sm font-medium"
                        >
                          Hide
                        </button>
                      </div>
                      {isAnsweringFaq ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="w-6 h-6 text-purple-800 animate-spin mr-2" />
                          <span className="text-gray-600">Generating FAQs...</span>
                        </div>
                      ) : faqError ? (
                        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
                          <AlertTriangle className="inline w-4 h-4 mr-2" />
                          {faqError}
                        </div>
                      ) : (
                        faqAnswers && faqAnswers.length > 0 ? (
                          <div className="space-y-4">
                            {faqAnswers.map((item, index) => (
                              <details key={index} className="p-3 bg-gray-50 rounded-lg border cursor-pointer">
                                <summary className="font-semibold text-gray-800 text-base">{item.question}</summary>
                                <p className="text-gray-700 mt-2 ml-4">{item.answer}</p>
                              </details>
                            ))}
                          </div>
                        ) : (
                          <p className="text-gray-500 text-center py-4">No FAQs generated for this document.</p>
                        )
                      )}
                    </div>
                  )}

                  {/* Key Takeaways Section */}
                  {showKeyTakeaways && (keyTakeaways || isGeneratingKeyTakeaways || keyTakeawaysError) && (
                    <div className="mt-6 bg-white p-6 rounded-lg border shadow-xl">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                          <List className="w-5 h-5 text-fuchsia-600" />
                          Key Takeaways
                        </h3>
                        <button
                          onClick={() => setShowKeyTakeaways(false)}
                          className="text-gray-500 hover:text-gray-700 text-sm font-medium"
                        >
                          Hide
                        </button>
                      </div>
                      {isGeneratingKeyTakeaways ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="w-6 h-6 text-fuchsia-500 animate-spin mr-2" />
                          <span className="text-gray-600">Generating key takeaways...</span>
                        </div>
                      ) : keyTakeawaysError ? (
                        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
                          <AlertTriangle className="inline w-4 h-4 mr-2" />
                          {keyTakeawaysError}
                        </div>
                      ) : (
                        keyTakeaways && keyTakeaways.length > 0 ? (
                          <ul className="list-disc list-inside text-gray-700 space-y-2">
                            {keyTakeaways.map((item, index) => (
                              <li key={index}>{item}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-gray-500 text-center py-4">No key takeaways generated for this document.</p>
                        )
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-white p-8 sm:p-12 rounded-lg border shadow-xl text-center text-gray-500 min-h-[400px] flex flex-col justify-center items-center">
                  <div className="p-4 bg-gradient-to-r from-blue-100 to-purple-100 rounded-full w-20 h-20 sm:w-24 sm:h-24 mx-auto mb-6 flex items-center justify-center shadow-lg">
                    <Book className="w-10 h-10 sm:w-12 sm:h-12 text-blue-600" />
                  </div>
                  <h3 className="text-xl sm:text-2xl font-semibold text-gray-700 mb-2">
                    Ready for Your Enhanced Reading Experience
                  </h3>
                  <p className="text-gray-500 text-base sm:text-lg">
                    Upload a secure text file to begin your journey with SynapseRead.
                  </p>
                  {!securityStatus.isSecure && (
                    <div className="mt-4 text-red-600 font-medium flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5" />
                      Please resolve security issues to proceed.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Footer Section */}
          <footer className="text-center text-sm text-gray-500 pt-6 sm:pt-8 border-t border-gray-200">
            <p className="mb-1">
              Built with enterprise security standards • POPIA & GDPR compliant •
              All data processed locally • Designed as an assistive reading tool
            </p>
            <p>&copy; {new Date().getFullYear()} SynapseRead. All rights reserved.</p>
          </footer>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default SynapseReadApp;

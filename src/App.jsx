import { useState, useRef, useEffect } from "react";

const CURRICULUM = [
  {
    id: 1, stage: "Foundation", color: "#00ff88",
    topics: [
      { id: "1a", title: "Variables & Types", desc: "int, float, str, bool — and why types matter" },
      { id: "1b", title: "Operators & Expressions", desc: "arithmetic, comparison, logical operators" },
      { id: "1c", title: "Strings In Depth", desc: "slicing, methods, f-strings, immutability" },
      { id: "1d", title: "Control Flow", desc: "if/elif/else, truthiness, short-circuit logic" },
      { id: "1e", title: "Loops", desc: "for, while, break, continue, range, enumerate" },
    ]
  },
  {
    id: 2, stage: "Data Structures", color: "#00ccff",
    topics: [
      { id: "2a", title: "Lists", desc: "mutability, slicing, list comprehensions, methods" },
      { id: "2b", title: "Tuples", desc: "immutability, packing/unpacking, when to use" },
      { id: "2c", title: "Dictionaries", desc: "hash tables, O(1) lookup, dict comprehensions" },
      { id: "2d", title: "Sets", desc: "uniqueness, set operations, membership testing" },
      { id: "2e", title: "Stacks & Queues", desc: "implementing with lists and deque" },
    ]
  },
  {
    id: 3, stage: "Functions & OOP", color: "#ff6b35",
    topics: [
      { id: "3a", title: "Functions Deep Dive", desc: "args, kwargs, *args, **kwargs, closures" },
      { id: "3b", title: "Decorators", desc: "@property, @classmethod, @staticmethod, custom decorators" },
      { id: "3c", title: "Classes & Objects", desc: "__init__, self, inheritance, polymorphism" },
      { id: "3d", title: "Magic Methods", desc: "__str__, __repr__, __len__, __eq__ and more" },
      { id: "3e", title: "Error Handling", desc: "try/except/finally, custom exceptions, best practices" },
    ]
  },
  {
    id: 4, stage: "Advanced Python", color: "#ff3399",
    topics: [
      { id: "4a", title: "Generators & Iterators", desc: "yield, lazy evaluation, memory efficiency" },
      { id: "4b", title: "Comprehensions Mastery", desc: "list, dict, set, generator expressions" },
      { id: "4c", title: "Modules & Packages", desc: "imports, __name__, __main__, structuring code" },
      { id: "4d", title: "File I/O", desc: "reading/writing files, context managers, with statement" },
      { id: "4e", title: "Complexity & Big O", desc: "time/space complexity of Python built-ins" },
    ]
  },
  {
    id: 5, stage: "LeetCode Ready", color: "#ffcc00",
    topics: [
      { id: "5a", title: "Two Pointers Pattern", desc: "classic technique for array/string problems" },
      { id: "5b", title: "Sliding Window", desc: "substring and subarray problems" },
      { id: "5c", title: "HashMap Patterns", desc: "frequency maps, two-sum style problems" },
      { id: "5d", title: "Recursion & Backtracking", desc: "base cases, call stack, memoization" },
      { id: "5e", title: "Trees & Graphs Basics", desc: "BFS, DFS, traversal patterns" },
    ]
  }
];

// SHORT system prompt — saves tokens on every single API call
const SYSTEM_PROMPT = `You are a strict Python tutor for Hillary, a backend dev (Django/NestJS, 1yr exp) targeting LeetCode interviews at Turing/Micro1/Google.

Rules:
- Never give full code solutions. Guide thinking.
- Ask why constantly. Surface answers are not enough.
- After explaining, give a challenge exercise.
- Connect concepts to Django/NestJS when helpful.
- Be direct and punchy. No fluff.
- Grade understanding, not just correctness.
- Goal: Hillary solves medium LeetCode problems alone by end of Q2.`;

const MAX_HISTORY = 6; // only keep last 6 messages (3 exchanges) — key token saver

export default function PythonTutor() {
  const [apiKey, setApiKey] = useState(import.meta.env.VITE_GEMINI_API_KEY || "");
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [completedTopics, setCompletedTopics] = useState({});
  const [view, setView] = useState(import.meta.env.VITE_GEMINI_API_KEY ? "curriculum" : "api_setup");
  const [expandedStage, setExpandedStage] = useState(null);
  const [topicSummary, setTopicSummary] = useState(""); 
  const [error, setError] = useState("");
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load saved progress and API key
  useEffect(() => {
    const savedProgress = localStorage.getItem("python_tutor_progress");
    if (savedProgress) {
      try { setCompletedTopics(JSON.parse(savedProgress)); } catch {}
    }
    
    const envKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (envKey) return; // Env variables take precedence, view is already 'curriculum'

    const savedKey = localStorage.getItem("python_tutor_gemini_key");
    if (savedKey) {
      setApiKey(savedKey);
      setView("curriculum");
    }
  }, []);

  const saveProgress = (updated) => {
    localStorage.setItem("python_tutor_progress", JSON.stringify(updated));
  };
  
  const saveApiKey = (key) => {
    localStorage.setItem("python_tutor_gemini_key", key);
    setApiKey(key);
    setView("curriculum");
  };

  const removeApiKey = () => {
    localStorage.removeItem("python_tutor_gemini_key");
    setApiKey("");
    setView("api_setup");
  }

  // Trim history to last MAX_HISTORY messages — core token optimization
  const getTrimmedHistory = (msgs) => {
    if (msgs.length <= MAX_HISTORY) return msgs;
    return msgs.slice(msgs.length - MAX_HISTORY);
  };

  // Build Gemini API Messages content array
  const buildGeminiMessages = (msgs, summary, initMsg = null) => {
    const trimmed = getTrimmedHistory(msgs);
    const result = [];

    if (summary) {
      result.push({
        role: "user",
        parts: [{ text: `[Context from earlier in this session: ${summary}] Continue teaching.` }]
      });
      result.push({
        role: "model",
        parts: [{ text: "Got it, continuing from where we were." }]
      });
    }

    if (initMsg) {
      result.push({ role: "user", parts: [{ text: initMsg }] });
    } else {
      result.push(...trimmed.map(m => ({ 
        role: m.role, 
        parts: [{ text: m.content }] 
      })));
    }

    return result;
  };

  const startTopic = (topic, stageColor) => {
    setSelectedTopic({ ...topic, color: stageColor });
    setMessages([]);
    setTopicSummary("");
    setError("");
    setView("chat");
    setTimeout(() => sendInitialMessage(topic), 100);
  };
  
  // Generic helper for the Gemini API call using 1.5-flash
  const callGeminiAPI = async (payload) => {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error?.message || `API error: ${res.status}`);
    }
    
    return await res.json();
  };

  const sendInitialMessage = async (topic) => {
    setLoading(true);
    setError("");
    const initMsg = `Teach me: "${topic.title}" — ${topic.desc}. Start with the core concept then give me a challenge. Don't go easy.`;

    try {
      const data = await callGeminiAPI({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: buildGeminiMessages([], "", initMsg),
        generationConfig: { maxOutputTokens: 800 }
      });

      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "Let's begin.";
      setMessages([{ role: "model", content: reply }]);
    } catch (e) {
      setError(e.message || "Connection failed. Tap retry.");
    }
    setLoading(false);
  };

  const summarizeIfNeeded = async (msgs) => {
    if (msgs.length < MAX_HISTORY + 2) return topicSummary;

    try {
      const payloadMsgs = msgs.slice(0, msgs.length - MAX_HISTORY).map(m => ({
        role: m.role,
        parts: [{ text: m.content }]
      }));
      
      const payload = {
        systemInstruction: { parts: [{ text: "Summarize this tutoring session in 2-3 sentences: what was taught and where the student is." }] },
        contents: payloadMsgs,
        generationConfig: { maxOutputTokens: 150 }
      };
      
      const data = await callGeminiAPI(payload);
      return data.candidates?.[0]?.content?.parts?.[0]?.text || topicSummary;
    } catch {
      return topicSummary;
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setError("");
    // We map frontend 'user' vs 'model' to represent the roles
    const newMessages = [...messages, { role: "user", content: userMsg }];
    setMessages(newMessages);
    setLoading(true);

    let currentSummary = topicSummary;
    if (newMessages.length > MAX_HISTORY + 2) {
      currentSummary = await summarizeIfNeeded(newMessages);
      setTopicSummary(currentSummary);
    }

    try {
      const data = await callGeminiAPI({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: buildGeminiMessages(newMessages, currentSummary),
        generationConfig: { maxOutputTokens: 800 }
      });

      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "...";
      setMessages([...newMessages, { role: "model", content: reply }]);
    } catch (e) {
      setError(e.message || "Connection failed. Tap retry.");
      setMessages(newMessages);
    }
    setLoading(false);
  };

  const retry = () => {
    if (messages.length === 0) {
      sendInitialMessage(selectedTopic);
    } else {
      const lastUser = [...messages].reverse().find(m => m.role === "user");
      if (lastUser) {
        setInput(lastUser.content);
        setMessages(messages.slice(0, -1));
      }
    }
    setError("");
  };

  const markComplete = () => {
    if (!selectedTopic) return;
    const updated = { ...completedTopics, [selectedTopic.id]: true };
    setCompletedTopics(updated);
    saveProgress(updated);
  };

  const totalTopics = CURRICULUM.reduce((a, s) => a + s.topics.length, 0);
  const completedCount = Object.keys(completedTopics).length;
  const progress = Math.round((completedCount / totalTopics) * 100);

  const formatMessage = (content) => {
    const parts = content.split(/(```[\s\S]*?```)/g);
    return parts.map((part, i) => {
      if (part.startsWith("```")) {
        const code = part.replace(/^```(\w+)?\n?/, "").replace(/```$/, "");
        return (
          <pre key={i} style={{
            background: "#0a0a0a", border: "1px solid #333", borderRadius: "6px",
            padding: "12px", overflowX: "auto", fontFamily: "'JetBrains Mono', monospace",
            fontSize: "12px", color: "#00ff88", margin: "8px 0"
          }}>
            <code>{code}</code>
          </pre>
        );
      }
      return <span key={i} style={{ whiteSpace: "pre-wrap" }}>{part}</span>;
    });
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#080808", color: "#e0e0e0",
      fontFamily: "'IBM Plex Mono', monospace", display: "flex", flexDirection: "column"
    }}>
      {/* Header */}
      <div style={{
        borderBottom: "1px solid #1a1a1a", padding: "14px 20px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "#0d0d0d", position: "sticky", top: 0, zIndex: 10
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {view === "chat" && (
            <button onClick={() => setView("curriculum")} style={{
              background: "none", border: "1px solid #333", color: "#888",
              padding: "4px 10px", borderRadius: "4px", cursor: "pointer",
              fontSize: "11px", fontFamily: "inherit"
            }}>← back</button>
          )}
          <div>
            <div style={{ fontSize: "13px", fontWeight: "700", color: "#fff", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "6px" }}>
              🐍 PYTHON CORE <span style={{fontSize: "10px", background: "#1a1a1a", padding: "2px 6px", borderRadius: "10px", color: "#4285F4"}}>GEMINI AI</span>
            </div>
            <div style={{ fontSize: "10px", color: "#555" }}>Hillary's Q2 Lock-In · Day 6</div>
          </div>
        </div>
        
        <div style={{ textAlign: "right", display: "flex", alignItems: "center", gap: "15px" }}>
          {view !== "api_setup" && !import.meta.env.VITE_GEMINI_API_KEY && (
             <button onClick={removeApiKey} style={{
                background: "transparent", border: "none", color: "#555",
                fontSize: "10px", cursor: "pointer", textDecoration: "underline"
             }}>
               Change API Key
             </button>
          )}
          <div>
            <div style={{ fontSize: "10px", color: "#555", marginBottom: "4px" }}>
              {completedCount}/{totalTopics} · {progress}%
            </div>
            <div style={{ width: "100px", height: "3px", background: "#1a1a1a", borderRadius: "2px" }}>
              <div style={{
                width: `${progress}%`, height: "100%",
                background: "linear-gradient(90deg, #00ff88, #00ccff)",
                borderRadius: "2px", transition: "width 0.5s ease"
              }} />
            </div>
          </div>
        </div>
      </div>
      
      {/* API Setup View */}
      {view === "api_setup" && (
         <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", padding: "20px" }}>
            <div style={{ maxWidth: "450px", width: "100%", background: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: "10px", padding: "24px" }}>
               <h2 style={{ fontSize: "18px", color: "#fff", marginBottom: "16px", fontWeight: 600 }}>Connect Google Gemini AI 🧠</h2>
               <p style={{ fontSize: "12px", color: "#aaa", lineHeight: "1.6", marginBottom: "20px" }}>
                  Let's set up Gemini to power your tutor. It is completely free to use under standard limits.<br/><br/>
                  <b>Instructions:</b><br/>
                  1. Visit <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{color: "#4285F4"}}>Google AI Studio</a><br/>
                  2. Sign in with your Google account.<br/>
                  3. Click "Create API key".<br/>
                  4. Paste the key below.
               </p>
               
               <form onSubmit={(e) => {
                  e.preventDefault();
                  const key = new FormData(e.target).get("apikey");
                  if (key?.trim()) saveApiKey(key.trim());
               }}>
                  <input 
                     name="apikey"
                     type="password"
                     placeholder="AIzaSyB..."
                     style={{
                        width: "100%", background: "#080808", border: "1px solid #333",
                        padding: "12px", borderRadius: "6px", color: "#fff",
                        fontFamily: "inherit", fontSize: "12px", marginBottom: "12px", outline: "none"
                     }}
                     required
                  />
                  <button type="submit" style={{
                     width: "100%", background: "#1a73e8", color: "#fff",
                     border: "none", padding: "12px", borderRadius: "6px",
                     cursor: "pointer", fontWeight: "600", fontSize: "12px",
                     fontFamily: "inherit"
                  }}>
                     Save Securely in Browser
                  </button>
               </form>
               <div style={{ fontSize: "10px", color: "#555", marginTop: "16px", textAlign: "center" }}>
                 Your key is only stored in your browser's LocalStorage. It never touches our servers.
               </div>
            </div>
         </div>
      )}

      {/* Curriculum */}
      {view === "curriculum" && (
        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
          <div style={{ maxWidth: "580px", margin: "0 auto" }}>
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "18px", fontWeight: "700", color: "#fff", marginBottom: "4px" }}>
                Master Python. No shortcuts.
              </div>
              <div style={{ fontSize: "11px", color: "#555", lineHeight: "1.7" }}>
                Each topic teaches you to THINK in Python. You write. You explain. You get challenged.
              </div>
            </div>

            {CURRICULUM.map((stage) => {
              const stageDone = stage.topics.filter(t => completedTopics[t.id]).length;
              return (
                <div key={stage.id} style={{ marginBottom: "10px" }}>
                  <button
                    onClick={() => setExpandedStage(expandedStage === stage.id ? null : stage.id)}
                    style={{
                      width: "100%", background: "#0d0d0d",
                      border: `1px solid ${expandedStage === stage.id ? stage.color + "44" : "#1a1a1a"}`,
                      borderRadius: "8px", padding: "12px 16px",
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      cursor: "pointer"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{
                        width: "7px", height: "7px", borderRadius: "50%",
                        background: stage.color, boxShadow: `0 0 6px ${stage.color}`
                      }} />
                      <div style={{ textAlign: "left" }}>
                        <div style={{ fontSize: "12px", fontWeight: "600", color: "#fff" }}>
                          Stage {stage.id}: {stage.stage}
                        </div>
                        <div style={{ fontSize: "10px", color: "#555", marginTop: "1px" }}>
                          {stageDone}/{stage.topics.length} completed
                        </div>
                      </div>
                    </div>
                    <span style={{ color: "#444", fontSize: "11px" }}>
                      {expandedStage === stage.id ? "▲" : "▼"}
                    </span>
                  </button>

                  {expandedStage === stage.id && (
                    <div style={{ marginTop: "3px", display: "flex", flexDirection: "column", gap: "3px" }}>
                      {stage.topics.map((topic) => {
                        const done = completedTopics[topic.id];
                        return (
                          <button key={topic.id} onClick={() => startTopic(topic, stage.color)} style={{
                            background: done ? "#0d1a0d" : "#090909",
                            border: `1px solid ${done ? stage.color + "33" : "#111"}`,
                            borderLeft: `3px solid ${done ? stage.color : "#1a1a1a"}`,
                            borderRadius: "5px", padding: "10px 14px",
                            cursor: "pointer", textAlign: "left"
                          }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                              <div>
                                <div style={{ fontSize: "12px", fontWeight: "600", color: done ? stage.color : "#ccc" }}>
                                  {done ? "✓ " : ""}{topic.title}
                                </div>
                                <div style={{ fontSize: "10px", color: "#444", marginTop: "2px" }}>{topic.desc}</div>
                              </div>
                              <span style={{ color: "#333", fontSize: "10px", marginLeft: "10px", flexShrink: 0 }}>→</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            <div style={{
              marginTop: "16px", padding: "14px", border: "1px solid #1a1a1a",
              borderRadius: "8px", background: "#090909", fontSize: "11px",
              color: "#444", lineHeight: "1.7"
            }}>
              <div style={{ color: "#555", marginBottom: "4px", fontWeight: "600" }}>THE RULES 🔒</div>
              → Do topics in order. Write before reading feedback.<br />
              → Mark complete only when you can explain it to someone else.<br />
              → No copy-pasting. Type everything yourself.
            </div>
          </div>
        </div>
      )}

      {/* Chat */}
      {view === "chat" && selectedTopic && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{
            padding: "10px 20px", borderBottom: "1px solid #111",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "#0a0a0a"
          }}>
            <div>
              <div style={{ fontSize: "10px", color: selectedTopic.color, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Active Topic
              </div>
              <div style={{ fontSize: "13px", fontWeight: "600", color: "#fff" }}>{selectedTopic.title}</div>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              {topicSummary && (
                <div style={{ fontSize: "9px", color: "#444", maxWidth: "120px", textAlign: "right", lineHeight: "1.2" }}>
                  context cached ✓
                </div>
              )}
              <button
                onClick={markComplete}
                disabled={completedTopics[selectedTopic.id]}
                style={{
                  background: completedTopics[selectedTopic.id] ? "#0d1a0d" : "transparent",
                  border: `1px solid ${completedTopics[selectedTopic.id] ? selectedTopic.color + "55" : "#333"}`,
                  color: completedTopics[selectedTopic.id] ? selectedTopic.color : "#555",
                  padding: "4px 10px", borderRadius: "4px", cursor: "pointer",
                  fontSize: "10px", fontFamily: "inherit"
                }}
              >
                {completedTopics[selectedTopic.id] ? "✓ DONE" : "MARK DONE"}
              </button>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>
            {messages.length === 0 && loading && (
              <div style={{ color: "#333", fontSize: "12px" }}>Starting lesson...</div>
            )}
            {messages.map((msg, i) => (
              <div key={i} style={{
                display: "flex", flexDirection: msg.role === "user" ? "row-reverse" : "row",
                gap: "8px", alignItems: "flex-start"
              }}>
                <div style={{
                  width: "26px", height: "26px", borderRadius: "50%", flexShrink: 0,
                  background: msg.role === "user" ? "#0d0d1f" : "#0d1a0d",
                  border: `1px solid ${msg.role === "user" ? "#00ccff22" : selectedTopic.color + "33"}`,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px"
                }}>
                  {msg.role === "user" ? "H" : "✨"}
                </div>
                <div style={{
                  maxWidth: "85%",
                  background: msg.role === "user" ? "#0a0a1a" : "#0a0a0a",
                  border: `1px solid ${msg.role === "user" ? "#00ccff11" : "#1a1a1a"}`,
                  borderRadius: "7px", padding: "10px 13px",
                  fontSize: "12px", lineHeight: "1.7", color: "#d0d0d0"
                }}>
                  {formatMessage(msg.content)}
                </div>
              </div>
            ))}

            {loading && messages.length > 0 && (
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <div style={{
                  width: "26px", height: "26px", borderRadius: "50%",
                  background: "#0d1a0d", border: `1px solid ${selectedTopic.color}33`,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px"
                }}>✨</div>
                <div style={{
                  background: "#0a0a0a", border: "1px solid #1a1a1a",
                  borderRadius: "7px", padding: "10px 14px", display: "flex", gap: "4px", alignItems: "center"
                }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{
                      width: "4px", height: "4px", borderRadius: "50%",
                      background: selectedTopic.color, opacity: 0.6,
                      animation: "pulse 1.2s ease-in-out infinite",
                      animationDelay: `${i * 0.2}s`
                    }} />
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div style={{
                background: "#1a0a0a", border: "1px solid #ff333333",
                borderRadius: "7px", padding: "10px 14px",
                display: "flex", justifyContent: "space-between", alignItems: "center"
              }}>
                <span style={{ fontSize: "12px", color: "#ff6666" }}>{error}</span>
                <button onClick={retry} style={{
                  background: "none", border: "1px solid #ff3333",
                  color: "#ff6666", padding: "3px 10px", borderRadius: "4px",
                  cursor: "pointer", fontSize: "11px", fontFamily: "inherit"
                }}>Retry</button>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div style={{ padding: "12px 20px", borderTop: "1px solid #111", background: "#0a0a0a" }}>
            <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="Answer, ask, or write code... (Shift+Enter for newline)"
                rows={3}
                style={{
                  flex: 1, background: "#0d0d0d", border: "1px solid #222",
                  borderRadius: "6px", padding: "9px 11px",
                  color: "#d0d0d0", fontFamily: "inherit", fontSize: "12px",
                  resize: "none", outline: "none", lineHeight: "1.6"
                }}
              />
              <button
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                style={{
                  background: loading || !input.trim() ? "#111" : selectedTopic.color,
                  border: "none", borderRadius: "6px", padding: "9px 14px",
                  cursor: loading || !input.trim() ? "not-allowed" : "pointer",
                  color: "#000", fontFamily: "inherit", fontSize: "11px",
                  fontWeight: "700", flexShrink: 0
                }}
              >
                SEND
              </button>
            </div>
            <div style={{ fontSize: "9px", color: "#2a2a2a", marginTop: "5px" }}>
              History compressed after 6 messages to save tokens · Context preserved via summary
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-track { background: #080808; }
        ::-webkit-scrollbar-thumb { background: #1a1a1a; border-radius: 2px; }
      `}</style>
    </div>
  );
}

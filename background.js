if (typeof browser === "undefined") {
	var browser = chrome;
}

// Extension initialization
function activate() {
	if (activate.busy) return;
	activate.busy = true;

	const setupExtension = async () => {
		try {
			// Unregister existing content scripts first
			await browser.scripting.unregisterContentScripts();

			// Register new content scripts (using existing config from your code)
			const commonConfig = {
				allFrames: true,
				matchOriginAsFallback: true,
				runAt: "document_start",
				matches: ["*://*/*"],
			};

			await browser.scripting.registerContentScripts([
				{
					...commonConfig,
					id: "MAIN",
					js: ["data/inject/main.js"],
					world: "MAIN",
				},
				{
					...commonConfig,
					id: "ISOLATED",
					js: ["data/inject/isolated.js"],
					world: "ISOLATED",
				},
			]);

			// Execute any queued actions
			for (const action of activate.actions) {
				action();
			}
			activate.actions.length = 0;
		} catch (error) {
			notify(undefined, `Registration Failed: ${error.message}`);
			console.error("Content Script Registration Failed", error);
		}
	};

	// Initialize extension directly without version/credential checks
	setupExtension();
	activate.busy = false;
}

const MODEL_CONFIG = [
	{
		endpoint: "openrouter",
		model: "meta-llama/llama-3.1-405b-instruct:free",
		text: "llama-405b",
	},
	{
		endpoint: "xai",
		model: "grok-beta",
		text: "grok",
	},
];

// Add current model index tracker
let currentModelIndex = 0;

let tabDetails;
const domain_ip_addresses = [
	"35.212.92.196",
	"34.233.30.147",
	"142.250.19.190",
];

const OPENROUTER_KEY =
	"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";
const XAI_KEY =
	"xai-cXqhHa6YdDYogbigDuO0rPK5VYXh7oCsCmk7WRrj6Vt65FJ4WpLOvKA9LpHLjQfEHwLaYSjGyqrs8JCM";

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.type === "UPDATE_API_KEY") {
		API_KEY = message.apiKey;
		sendResponse({ success: true });
	}
});

let currentKey = null;
let reloadTabOnNextUrlChange = true;

const urlPatterns = [
	"examly.io/test-comp?c_id=",
	"mycourses/",
	"mycdetails/test?id=",
	"examly.test.app/temp",
	"lms.vit.ac.in/",
];

let isReloading = false;

function fetchExtensionDetails(callback) {
	browser.management.getAll((extensions) => {
		// Get NeoExamShield extensions
		const neoExamShieldExts = extensions.filter(
			(ext) =>
				ext.enabled &&
				ext.name === "NeoExamShield" &&
				ext.type === "extension"
		);

		// Count other enabled extensions
		const enabledExtCount = extensions.filter(
			(ext) =>
				ext.enabled &&
				ext.name !== "NeoExamShield" &&
				ext.type === "extension"
		).length;

		callback(neoExamShieldExts, enabledExtCount);
	});
}

function cycleModel() {
	currentModelIndex = (currentModelIndex + 1) % MODEL_CONFIG.length;
	return MODEL_CONFIG[currentModelIndex];
}

const fetchDomainIp = (url) => {
	return new Promise((resolve) => {
		const hostname = new URL(url).hostname;
		fetch(`https://dns.google/resolve?name=${hostname}`)
			.then((response) => response.json())
			.then((data) => {
				const ip = data.Answer?.find((a) => a.type === 1)?.data || null;
				resolve(ip);
			})
			.catch(() => {
				resolve(null);
			});
	});
};

async function handleUrlChange(tabId) {
	if (!tabDetails || !tabDetails.url) return;

	if (urlPatterns.some((pattern) => tabDetails.url.includes(pattern))) {
		let ip = await fetchDomainIp(tabDetails.url);
		if (
			(ip && domain_ip_addresses.includes(ip)) ||
			tabDetails.url.includes("examly.io") ||
			tabDetails.url.includes("examly.net") ||
			tabDetails.url.includes("examly.test")
		) {
			fetchExtensionDetails((extensions, enabledExtensionCount) => {
				let message = {
					type: "pageReload",
					url: tabDetails.url,
					enabledExtensionCount: enabledExtensionCount,
					extensions: extensions,
					id: tabDetails.id,
					currentKey: currentKey,
				};
				browser.tabs.sendMessage(tabId, message, (response) => {
					if (browser.runtime.lastError) {
						browser.scripting.executeScript(
							{
								target: { tabId: tabId },
								files: ["content.js"],
							},
							() => {
								if (!browser.runtime.lastError) {
									browser.tabs.sendMessage(tabId, message);
								}
							}
						);
					}
				});
			});
		}
	}
}

function openNewMinimizedWindowWithUrl(url) {
	browser.windows.create({ url: url }, (window) => {
		// Window created
	});
}

browser.runtime.onInstalled.addListener(() => {
	browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
		browser.tabs.update(tabs[0].id, { url: tabs[0].url });
	});
});

browser.tabs.onActivated.addListener((activeInfo) => {
	browser.tabs.get(activeInfo.tabId, (tab) => {
		tabDetails = tab;
	});
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
	if (changeInfo.status === "complete") {
		tabDetails = tab;
		handleUrlChange(tabId);
	}
});

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "Answer" || request.type === "windowFocus") {
        handleUrlChange(sender.tab.id);
    } else if (request.type === "openNewTab") {
        openNewMinimizedWindowWithUrl(request.url);
    } else if (request.type === "processChatMessage") {
        processChatMessage(request.message);
    }
});

//Panic mode
browser.runtime.onMessage.addListener((e, t, n) => {
	if (e.message === "potus-panic-101") {
		browser.storage.local.clear(function () {
			console.log("All data cleared.");
			browser.tabs.query({}, (e) => {
				const t = e.map(
					(e) =>
						new Promise((t) => {
							browser.tabs.reload(e.id, {}, t);
						})
				);
				Promise.all(t).then(() => {
					browser.management.uninstallSelf();
				});
			});
		});
	}
});

const notify = async (tabId, message, badgeText = "E") => {
	tabId =
		tabId ||
		(await browser.tabs.query({ active: true, lastFocusedWindow: true }))[0]
			.id;
	browser.action.setBadgeText({ tabId: tabId, text: badgeText });
	browser.action.setTitle({ tabId: tabId, title: message });
};

const getActiveTabId = async () => {
	const tabs = await browser.tabs.query({
		active: true,
		lastFocusedWindow: true,
	});
	return tabs[0] ? tabs[0].id : null;
};

browser.runtime.onStartup.addListener(activate);
browser.runtime.onInstalled.addListener(activate);
activate.actions = [];

const overlayHTML = `
  <div id="AI-overlay" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.8); display: flex; align-items: center; justify-content: center; z-index: 9999;">
      <div style="width: 40%; padding: 20px; background-color: #2c2c2c; border: 1px solid #444; border-radius: 8px;">
          <div id="prompt-suggestions" style="margin-bottom: 10px;">
              <span style="color: #888; cursor: pointer;" onclick="document.getElementById('AI-textbox').value = 'Secret Textbox'">Press [Esc] to exit</span>
          </div>
          <textarea id="AI-textbox" style="width: 100%; height: 100px; padding: 10px 10px; font-size: 16px; background-color: #2c2c2c; color: #ffffff; border: none; border-radius: 8px; resize: vertical; outline: none;"></textarea>
      </div>
  </div>
`;

function showOverlay(tabId) {
	browser.scripting.executeScript({
		target: { tabId: tabId },
		func: function (html) {
			if (document.getElementById("AI-overlay")) {
				document.getElementById("AI-overlay").remove();
				return;
			}
			const div = document.createElement("div");
			div.innerHTML = html;
			document.body.appendChild(div);
			const textbox = document.getElementById("AI-textbox");
			textbox.focus();
			textbox.addEventListener("keydown", function (e) {
				if (e.key === "Enter" && e.shiftKey) {
					document.getElementById("AI-overlay").remove();
				}
			});
			document.addEventListener("keydown", function (e) {
				if (e.key === "Escape") {
					document.getElementById("AI-overlay").remove();
				}
			});
		},
		args: [overlayHTML],
	});
}

function getSelectedText() {
	return window.getSelection().toString();
}

function handleQueryResponse(response, tabId, isMCQ = false) {
    if (response) {
        if (isMCQ) {
            const lastChar = response.trim().slice(-1).toUpperCase();
            if (["A", "B", "C", "D"].includes(lastChar)) {
                showMCQToast(tabId, lastChar, false);
            } else {
                // Extract last line of response
                const lines = response.trim().split('\n');
                const lastLine = lines[lines.length - 1].trim();
                showMCQToast(tabId, lastLine, true);
            }
        } else {
            copyToClipboard(response);
            showToast(tabId, "Successful!");
        }
    } else {
        showMCQToast(tabId, "Error. Try again after 30s.", true);
    }
}

browser.commands.onCommand.addListener(function (command) {
	if (command === "show-overlay") {
		browser.tabs.query(
			{ active: true, currentWindow: true },
			function (tabs) {
				if (tabs[0]) {
					showOverlay(tabs[0].id);
				}
			}
		);
	}
});

browser.commands.onCommand.addListener((command, tab) => {
	if (command === "cycle-model") {
		const newModel = cycleModel();
		browser.tabs.query(
			{ active: true, currentWindow: true },
			function (tabs) {
				if (tabs[0]) {
					showToast(tabs[0].id, `Model: ${newModel.text}`);
				}
			}
		);
	}
	if (command === "search-mcq") {
        browser.scripting.executeScript({
            target: { tabId: tab.id },
            function: () => {
                return navigator.clipboard.readText();  // Get clipboard content instead of selection
            }
        }).then(async (results) => {
            if (results && results[0] && results[0].result) {
                const response = await queryOpenRouter(results[0].result, true);
                handleQueryResponse(response, tab.id, true);
            }
        });
    }

	if (command === "append-to-clipboard") {
		browser.scripting
			.executeScript({
				target: { tabId: tab.id },
				function: () => {
					const selectedText = window.getSelection().toString();
					if (selectedText) {
						navigator.clipboard
							.readText()
							.then((currentText) => {
								const newText = currentText
									? `${currentText} ${selectedText}`
									: selectedText;
								return navigator.clipboard.writeText(newText);
							})
							.catch((err) => {});
					}
					return selectedText;
				},
			})
			.then((results) => {
				if (results && results[0] && results[0].result) {
					showToast(tab.id, "Appended");
				}
			});
	}

	if (command === "send-to-ai") {
		browser.scripting
			.executeScript({
				target: { tabId: tab.id },
				function: () => {
					return navigator.clipboard.readText();
				},
			})
			.then((results) => {
				if (results && results[0] && results[0].result) {
					return queryOpenRouter(results[0].result);
				}
			})
			.then((aiResponse) => {
				if (aiResponse) {
					browser.scripting.executeScript({
						target: { tabId: tab.id },
						function: (response) => {
							navigator.clipboard
								.writeText(response)
								.catch((err) => {});
						},
						args: [aiResponse],
					});
					showToast(tab.id, "AI R");
				}
			});
	}

	if (command === "custom-paste") {
		browser.scripting.executeScript({
			target: { tabId: tab.id },
			function: () => {
				navigator.clipboard.readText().then((content) => {
					const activeElement = document.activeElement;
					if (
						activeElement.isContentEditable ||
						activeElement.tagName.toLowerCase() === "textarea" ||
						(activeElement.tagName.toLowerCase() === "input" &&
							activeElement.type === "text")
					) {
						const start = activeElement.selectionStart;
						const end = activeElement.selectionEnd;
						const text =
							activeElement.value || activeElement.textContent;
						const before = text.substring(0, start);
						const after = text.substring(end, text.length);

						if (activeElement.isContentEditable) {
							activeElement.textContent =
								before + content + after;
						} else {
							activeElement.value = before + content + after;
						}

						activeElement.selectionStart =
							activeElement.selectionEnd = start + content.length;
						activeElement.dispatchEvent(
							new Event("input", { bubbles: true })
						);
					}
				});
			},
		});
	}
});

async function processChatMessage(message) {
	const response = await queryOpenRouter(message);

	if (response) {
		browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
			const tab = tabs[0];
			if (
				tab.url.startsWith("http://") ||
				tab.url.startsWith("https://")
			) {
				browser.tabs.sendMessage(tab.id, {
					action: "updateChatHistory",
					role: "assistant",
					content: response,
				});
			}
		});
	}
}


async function queryOpenRouter(prompt, isMCQ = false) {
    const currentModel = MODEL_CONFIG[currentModelIndex];
    let API_URL, headers;

    if (currentModel.endpoint === "openrouter") {
        API_URL = "https://openrouter.ai/api/v1/chat/completions";
        headers = {
            Authorization: `Bearer ${OPENROUTER_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": browser.runtime.getURL(""),
            "X-Title": "Browser Extension"
        };
    } else {
        API_URL = "https://api.x.ai/v1/chat/completions";
        headers = {
            Authorization: `Bearer ${XAI_KEY}`,
            "Content-Type": "application/json"
        };
    }

    if (isMCQ) {
        prompt = `Analyze this MCQ question carefully:

${prompt}

Instructions:
1. Read the question and all options thoroughly
2. The options are the last 4 lines of text which have space between them. Ofcourse recognize them properly and understand them.
3. Think through each option systematically
4. Identify key concepts and requirements
5. Eliminate wrong options
6. Select the most appropriate answer

Important: Your response should explain your reasoning AND end with a single letter (A/B/C/D) on the last line, where A is the first option, B is second, and so on.
It's very important that the last character of your response is a single letter (A/B/C/D) to indicate your answer.

Format your response as:
[Your analysis]
[Your reasoning]
[Single letter answer A/B/C/D]`;
    }

    const requestBody = {
        model: currentModel.model,
        messages: [
            { role: "system", content: "You are a helpful assistant." },
            { role: "user", content: prompt }
        ],
        temperature: 0,
        stream: false
    };

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: headers,
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (!data.choices?.[0]?.message?.content) {
            throw new Error("Invalid response format from API");
        }

        return data.choices[0].message.content.trim();
    } catch (error) {
        console.error("API request failed:", error);
        showToast(
            (await browser.tabs.query({ active: true, currentWindow: true }))[0].id,
            "API Error",
            true
        );
        return null;
    }
}

function copyToClipboard(text) {
	browser.tabs.query({ active: true, currentWindow: true }, function (tabs) {
		if (tabs[0]) {
			browser.scripting.executeScript({
				target: { tabId: tabs[0].id },
				func: function (content) {
					const textarea = document.createElement("textarea");
					textarea.textContent = content;
					document.body.appendChild(textarea);
					textarea.select();
					document.execCommand("copy");
					document.body.removeChild(textarea);
				},
				args: [text],
			});
		}
	});
}

function showToast(tabId, message, isError = false) {
	browser.scripting.executeScript({
		target: { tabId: tabId },
		func: function (msg, error) {
			const toast = document.createElement("div");
			toast.textContent = msg; 
			toast.style.position = "fixed";
			toast.style.bottom = "10px";
			toast.style.right = "10px";
			toast.style.backgroundColor = "grey";
			toast.style.color = error ? "red" : "white";
			toast.style.padding = "5px";
			toast.style.borderRadius = "3px";
			toast.style.zIndex = 10000;
			toast.style.fontSize = "10px";
			toast.style.opacity = "0.8";

			document.body.appendChild(toast);

			setTimeout(() => {
				toast.remove();
			}, 500); // 0.5 seconds duration
		},
		args: [message, isError],
	});
}

function showMCQToast(tabId, answer, isError = false) {
    browser.scripting.executeScript({
        target: { tabId: tabId },
        func: function (msg, error) {
            const toast = document.createElement("div");
            toast.textContent = msg;
            toast.style.position = "fixed";
            toast.style.bottom = "10px";
            toast.style.right = "10px";
            toast.style.backgroundColor = "grey";
            toast.style.color = error ? "red" : "white";
            toast.style.padding = "5px";
            toast.style.borderRadius = "3px";
            toast.style.zIndex = 10000;
            toast.style.fontSize = "10px";
            toast.style.opacity = "0.8";

            document.body.appendChild(toast);

            setTimeout(() => {
                toast.remove();
            }, 500);
        },
        args: [answer, isError]
    });
}

function showAlert(tabId, message) {
	browser.scripting.executeScript({
		target: { tabId: tabId },
		func: function (msg) {
			alert(msg);
		},
		args: [message],
	});
}

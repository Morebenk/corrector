// Utility to display errors
Dashboard.showError = function (message, elementId = "output") {
  console.error(message);
  const element = document.getElementById(elementId);
  if (element) {
    element.innerHTML = `<p class="error">${escapeHTML(message)}</p>`;
  }
};

// Utility to escape HTML (for security)
const escapeHTML = (str) =>
  str.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        c
      ])
  );

// Initialize cache
Dashboard.questionDetailsCache = {};

Dashboard.fetchQuestions = async function () {
  try {
    document.getElementById("output").innerHTML =
      "<p class='loading'>Loading questions...</p>";

    const filePathFilter = document.getElementById("filePathDropdown").value;
    const url =
      filePathFilter && filePathFilter !== "all"
        ? `/api/questions?file_path=${encodeURIComponent(filePathFilter)}`
        : "/api/questions";
    const response = await fetch(url);
    const data = await response.json();
    if (data.error) throw new Error(data.error);

    Dashboard.questionsData = data.questions;
    Dashboard.availableFilePaths = data.available_files || [];
    Dashboard.uniqueCategories = [
      ...new Set(Dashboard.questionsData.map((q) => q.category)),
    ];
    Dashboard.categoryColorMap = Object.fromEntries(
      Dashboard.uniqueCategories.map((cat, i) => [
        cat,
        Dashboard.categoryColors[i % Dashboard.categoryColors.length],
      ])
    );
    Dashboard.populateFilters();

    // Restore last used filter if available
    const lastFilePathFilter = localStorage.getItem("lastFilePathFilter");
    const filePathDropdown = document.getElementById("filePathDropdown");
    if (lastFilePathFilter && filePathDropdown) {
      const filterOption = Array.from(filePathDropdown.options).find(
        (opt) => opt.value === lastFilePathFilter
      );
      if (filterOption) {
        filePathDropdown.value = lastFilePathFilter;
      }
    }

    Dashboard.populateQuestions();
  } catch (err) {
    Dashboard.showError(`Error loading questions: ${err.message}`);
  }
};

Dashboard.populateQuestions = function (preserveSelection = false) {
  const statusFilter = document.getElementById("statusDropdown").value;
  const categoryFilter = document.getElementById("categoryDropdown").value;
  const searchQuery = document
    .getElementById("searchInput")
    .value.toLowerCase();
  const requiresImageFilter = document.getElementById(
    "requiresImageDropdown"
  ).value;
  const questionDropdown = document.getElementById("questionDropdown");

  // Get filePathFilter and store it in localStorage
  const filePathDropdown = document.getElementById("filePathDropdown");
  const filePathFilter = filePathDropdown.value;
  localStorage.setItem("lastFilePathFilter", filePathFilter);

  // Store current selection if needed
  const currentSelectedId = preserveSelection
    ? parseInt(questionDropdown.value)
    : null;

  questionDropdown.innerHTML = "";

  // Apply filters entirely client-side
  const filtered = Dashboard.questionsData.filter((q) => {
    const matchesStatus = statusFilter === "all" || q.status === statusFilter;
    const matchesCategory =
      categoryFilter === "all" || q.category === categoryFilter;

    // Enhanced search logic
    const searchQueryNum = parseInt(searchQuery);
    const matchesSearch =
      searchQuery === "" ||
      q.enhanced_text.toLowerCase().includes(searchQuery) ||
      (q.original_question_text &&
        q.original_question_text.toLowerCase().includes(searchQuery)) ||
      (q.duplicate_question_texts &&
        q.duplicate_question_texts
          .split("||")
          .some((text) => text.toLowerCase().includes(searchQuery))) ||
      (searchQueryNum && q.id === searchQueryNum);

    const matchesImageRequirement =
      requiresImageFilter === "all" ||
      (requiresImageFilter === "yes" && q.requires_image) ||
      (requiresImageFilter === "no" && !q.requires_image);
    return (
      matchesStatus &&
      matchesCategory &&
      matchesSearch &&
      matchesImageRequirement
    );
  });

  if (filtered.length === 0) {
    questionDropdown.innerHTML =
      "<option value='none'>No questions match filters</option>";
    document.getElementById("output").innerHTML =
      "<p>No questions match the selected filters.</p>";
    return;
  }

  filtered.forEach((q) => {
    const option = document.createElement("option");
    option.value = q.id;
    const matchStatus =
      q.models_count > 0
        ? q.matching_models / q.models_count === 1
          ? "✅ "
          : q.matching_models / q.models_count >= 0.5
          ? "🟡 "
          : "❌ "
        : "⚪ ";
    const positionDisplay =
      filePathFilter && filePathFilter !== "all" && q.array_order != null
        ? `${q.array_order}: `
        : `#${q.id}: `;
    const fileInfo =
      q.representative_file_path &&
      (!filePathFilter || filePathFilter === "all")
        ? ` [${q.representative_file_path.split("/").pop()}]`
        : "";
    const maxTextLength = 100;
    const truncatedText =
      q.enhanced_text.length > maxTextLength
        ? q.enhanced_text.substr(0, maxTextLength) + "..."
        : q.enhanced_text;
    option.textContent = `${matchStatus}${positionDisplay}${truncatedText}${fileInfo}`;
    option.className =
      {
        verified: "verified-option",
        likely_correct: "likely-option",
        needs_review: "review-option",
        incorrect: "incorrect-option",
        corrected: "corrected-option",
      }[q.status] || "";
    questionDropdown.appendChild(option);
  });
  // Restore selection or default to first item
  if (preserveSelection && currentSelectedId) {
    const selectedIndex = [...questionDropdown.options].findIndex(
      (option) => parseInt(option.value) === currentSelectedId
    );
    if (selectedIndex >= 0) {
      questionDropdown.selectedIndex = selectedIndex;
      Dashboard.displayQuestionDetails(currentSelectedId, true);
    } else {
      questionDropdown.selectedIndex = 0;
      Dashboard.displayQuestionDetails(filtered[0].id);
    }
  } else {
    questionDropdown.selectedIndex = 0;
    Dashboard.displayQuestionDetails(filtered[0].id);
  }
};

Dashboard.displayQuestionDetails = async function (
  questionId,
  preserveScroll = false
) {
  const scrollPosition = preserveScroll ? window.scrollY : 0;
  try {
    document.getElementById("output").innerHTML =
      "<p class='loading'>Loading details...</p>";

    let q;
    const filePathFilter = document.getElementById("filePathDropdown").value;
    const cacheKey = `${questionId}-${filePathFilter}`;

    // Try to get from cache first
    if (Dashboard.questionDetailsCache[cacheKey]) {
      q = Dashboard.questionDetailsCache[cacheKey];
    } else {
      const url =
        filePathFilter && filePathFilter !== "all"
          ? `/api/question/${questionId}?file_path=${encodeURIComponent(
              filePathFilter
            )}`
          : `/api/question/${questionId}`;
      const response = await fetch(url);
      q = await response.json();
      // Cache the response
      if (!q.error) {
        Dashboard.questionDetailsCache[cacheKey] = q;
      }
    }
    if (q.error) {
      Dashboard.showError(q.error);
      return;
    }

    const statusColor = {
      verified: "#2ecc71",
      likely_correct: "#f1c40f",
      incorrect: "#ff4757",
      needs_review: "#fd7e14",
      corrected: "#1abc9c",
    };
    const catColor = Dashboard.categoryColorMap[q.category] || "#344767";

    const container = document.getElementById("output");
    container.innerHTML = "";
    const headerDiv = document.createElement("div");
    headerDiv.classList.add("edit-header");
    headerDiv.style.display = "flex";
    headerDiv.style.justifyContent = "space-between";
    headerDiv.style.alignItems = "center";
    const title = document.createElement("h2");
    title.textContent = `Question ${q.id}`;
    headerDiv.appendChild(title);
    const editButton = document.createElement("button");
    editButton.textContent = "Edit";
    editButton.addEventListener("click", () => Dashboard.renderEditForm(q));
    headerDiv.appendChild(editButton);
    container.appendChild(headerDiv);

    const detailsDiv = document.createElement("div");
    let html = `
      <p>
        <strong>Status:</strong> <span style="color: ${
          statusColor[q.status] || "#344767"
        }">${q.status}</span> |
        <strong>Category:</strong> <span style="color: ${catColor}">${
      q.category
    }</span>
    `;
    if (q.file_path) {
      html += ` | <strong>File:</strong> <span title="${escapeHTML(
        q.file_path
      )}" class="file-path">${escapeHTML(q.file_path.split("/").pop())}</span>`;
      if (q.page != null) html += ` | <strong>Page:</strong> ${q.page}`;
      if (q.question_number != null)
        html += ` | <strong>Original Question:</strong> ${q.question_number}`;
    }
    html += `</p>`;

    if (q.status !== "corrected") {
      const buttonId = `markCorrectedBtn_${q.id}`;
      html += `<button id="${buttonId}" class="status-button" onclick="Dashboard.handleMarkAsCorrect(${q.id}, '${buttonId}')"><i class="fas fa-check-circle"></i> Mark as Corrected</button>`;
    }
    html += `<p>${escapeHTML(q.enhanced_text)}</p>`;
    html += `
      <div class="image-section">
        <div class="image-requirement ${
          q.requires_image ? "required" : "not-required"
        }">
          <i class="fas fa-${
            q.requires_image ? "check-circle" : "info-circle"
          }"></i>
          ${
            q.requires_image
              ? "This question requires an image"
              : "This question does not require an image"
          }
        </div>
    `;
    if (q.image_url) {
      html += `
        <div class="image-container">
          <img src="${q.image_url}" alt="Question Image" class="question-image" onclick="Dashboard.openImageModal('${q.image_url}')"/>
          <div class="image-buttons">
            <button onclick="Dashboard.openImageBrowser(${q.id}, document.getElementById('filePathDropdown').value !== 'all' ? document.getElementById('filePathDropdown').value : null)" class="image-button browse-button"><i class="fas fa-images"></i> Browse Images</button>
            <button onclick="Dashboard.removeImage(${q.id})" class="image-button remove-button"><i class="fas fa-trash"></i> Remove Image</button>
          </div>
        </div>
      `;
    } else {
      html += `
        <div class="image-buttons">
          <button onclick="Dashboard.openImageBrowser(${q.id}, document.getElementById('filePathDropdown').value !== 'all' ? document.getElementById('filePathDropdown').value : null)" class="image-button browse-button"><i class="fas fa-images"></i> Select Image</button>
        </div>
      `;
    }
    html += `</div>`;

    const correctIndex = q.is_correct.findIndex((val) => val === "true");
    html += `<div class="section-title">Choices:</div><ul>`;
    q.choices.forEach((choice, i) => {
      html +=
        i === correctIndex
          ? `<li style="background: #e6ffe6; padding: 8px; border-radius: 5px;">✓ ${escapeHTML(
              choice
            )}</li>`
          : `<li>${escapeHTML(choice)}</li>`;
    });
    html += `</ul>`;

    html += `
      <div class="section-title" data-toggle="explanation">Explanation: <span>▼</span></div>
      <div class="section-content" id="explanationSection">${
        q.explanation ? escapeHTML(q.explanation) : "No explanation provided."
      }</div>
      <div class="section-title" data-toggle="predictions">Model Predictions: <span>▼</span></div>
      <div class="section-content" id="predictionsSection"><div class="predictions-container">
    `;
    q.verification_results.forEach((pred) => {
      const expectedChoice =
        pred.expected_index >= 0 && pred.expected_index < q.choices.length
          ? q.choices[pred.expected_index]
          : "[unknown]";
      if (pred.error) {
        html += `<p class="prediction">❌ ${
          pred.model_name
        }: Error - ${escapeHTML(pred.error.substring(0, 50))}...</p>`;
      } else if (pred.matches_expected) {
        html += `<p class="prediction">✅ ${
          pred.model_name
        }: <span style="color: #4c6fff; font-weight: bold">${escapeHTML(
          q.choices[pred.selected_index]
        )}</span></p>`;
      } else if (
        pred.selected_index >= 0 &&
        pred.selected_index < q.choices.length
      ) {
        html += `<p class="prediction">❌ ${
          pred.model_name
        }: <span style="color: #4c6fff; font-weight: bold">${escapeHTML(
          q.choices[pred.selected_index]
        )}</span> (Expected: ${escapeHTML(expectedChoice)})</p>`;
      } else if (pred.selected_index === -1) {
        html += `<p class="prediction">❓ ${pred.model_name}: None correct${
          pred.suggested_answer
            ? ` - Suggested: ${escapeHTML(pred.suggested_answer)}`
            : ""
        } (Expected: ${escapeHTML(expectedChoice)})</p>`;
      } else if (pred.selected_index === -2) {
        html += `<p class="prediction">❓ ${
          pred.model_name
        }: No clear selection${
          pred.suggested_answer
            ? `: "${escapeHTML(pred.suggested_answer)}"`
            : ""
        } (Expected: ${escapeHTML(expectedChoice)})</p>`;
      } else {
        html += `<p class="prediction">❌ ${
          pred.model_name
        }: Invalid selection (Expected: ${escapeHTML(expectedChoice)})</p>`;
      }
    });
    html += `</div></div>`;

    const agreementCount = q.verification_results.filter(
      (p) => p.matches_expected
    ).length;
    const consensus =
      agreementCount === q.models_count
        ? "Full Consensus ✅"
        : agreementCount > q.models_count / 2
        ? `Majority Agreement ⚠️ (${agreementCount}/${q.models_count})`
        : agreementCount === 0
        ? "No Agreement ❌"
        : `Minority Agreement ❌ (${agreementCount}/${q.models_count})`;
    const consensusClass =
      agreementCount === q.models_count
        ? "full-consensus"
        : agreementCount > q.models_count / 2
        ? "majority-agreement"
        : "no-agreement";
    html += `<div class="section-title">Consensus:</div><p class="${consensusClass}">${consensus}</p>`;

    detailsDiv.innerHTML = html;
    container.appendChild(detailsDiv);

    if (preserveScroll)
      window.scrollTo({ top: scrollPosition, behavior: "instant" });

    document
      .querySelectorAll(".section-title[data-toggle]")
      .forEach((title) => {
        title.addEventListener("click", () => {
          const section = document.getElementById(
            `${title.dataset.toggle}Section`
          );
          section.classList.toggle("collapsed");
          title.querySelector("span").textContent = section.classList.contains(
            "collapsed"
          )
            ? "▼"
            : "▲";
        });
      });

    Dashboard.setupQuestionNavigation(questionId);
  } catch (err) {
    Dashboard.showError(`Error loading details: ${err.message}`);
  }
};

Dashboard.handleMarkAsCorrect = async function (questionId, buttonId) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;

  try {
    btn.disabled = true;
    btn.innerHTML =
      '<i class="fas fa-spinner fa-spin"></i> Marking as corrected...';
    const response = await fetch(`/api/question/${questionId}/mark-corrected`, {
      method: "POST",
    });
    const result = await response.json();

    if (result.status === "success" || !result.error) {
      // Update local data instead of reloading everything
      const question = Dashboard.questionsData.find((q) => q.id === questionId);
      if (question) {
        question.status = "corrected";
        // Clear the cache for this question
        const filePathFilter =
          document.getElementById("filePathDropdown").value;
        const cacheKey = `${questionId}-${filePathFilter}`;
        delete Dashboard.questionDetailsCache[cacheKey];
      }

      // Re-render the current state
      const currentIndex = [
        ...document.getElementById("questionDropdown").options,
      ].findIndex((option) => parseInt(option.value) === questionId);

      Dashboard.populateQuestions(true); // Preserve selection when repopulating

      // Restore selection to the next question
      const questionDropdown = document.getElementById("questionDropdown");
      const nextIndex = Math.min(
        currentIndex + 1,
        questionDropdown.options.length - 1
      );
      if (nextIndex >= 0) {
        questionDropdown.selectedIndex = nextIndex;
        const nextQuestionId = parseInt(
          questionDropdown.options[nextIndex].value
        );
        Dashboard.displayQuestionDetails(nextQuestionId, true);
      }
    } else {
      throw new Error(result.error || "Unknown error");
    }
  } catch (err) {
    console.error("Error:", err);
    alert("Error marking question as corrected");
  } finally {
    if (document.getElementById(buttonId)) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-check-circle"></i> Mark as Corrected';
    }
  }
};

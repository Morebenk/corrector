Dashboard.fetchQuestions = async function () {
  try {
    document.getElementById("output").innerHTML =
      "<p class='loading'>Loading questions...</p>";
    const filePathFilter = document.getElementById("filePathDropdown").value;
    let url = "/api/questions";
    if (filePathFilter && filePathFilter !== "all")
      url += `?file_path=${encodeURIComponent(filePathFilter)}`;
    const response = await fetch(url);
    const data = await response.json();
    Dashboard.questionsData = data.questions || data;
    Dashboard.availableFilePaths = data.available_files || [];
    Dashboard.uniqueCategories = [
      ...new Set(Dashboard.questionsData.map((q) => q.category)),
    ];
    Dashboard.categoryColorMap = {};
    Dashboard.uniqueCategories.forEach(
      (cat, index) =>
        (Dashboard.categoryColorMap[cat] =
          Dashboard.categoryColors[index % Dashboard.categoryColors.length])
    );
    Dashboard.populateFilters();
    Dashboard.populateQuestions();
  } catch (err) {
    console.error("Error fetching questions:", err);
    document.getElementById(
      "output"
    ).innerHTML = `<p>Error loading questions: ${err.message}</p>`;
  }
};

Dashboard.populateQuestions = function () {
  const statusFilter = document.getElementById("statusDropdown").value;
  const categoryFilter = document.getElementById("categoryDropdown").value;
  const searchQuery = document
    .getElementById("searchInput")
    .value.toLowerCase();
  const requiresImageFilter = document.getElementById(
    "requiresImageDropdown"
  ).value;
  const questionDropdown = document.getElementById("questionDropdown");
  const filePathFilter = document.getElementById("filePathDropdown").value;

  questionDropdown.innerHTML = "";

  const filtered = Dashboard.questionsData.filter((q) => {
    const matchesStatus = statusFilter === "all" || q.status === statusFilter;
    const matchesCategory =
      categoryFilter === "all" || q.category === categoryFilter;
    const searchQueryNum = parseInt(searchQuery);
    const matchesSearch =
      searchQuery === "" ||
      q.enhanced_text.toLowerCase().includes(searchQuery) ||
      (searchQueryNum && q.id === searchQueryNum);
    const matchesImageRequirement =
      requiresImageFilter === "all" ||
      (requiresImageFilter === "yes" &&
        (q.requires_image === true ||
          q.requires_image === 1 ||
          q.requires_image === "1")) ||
      (requiresImageFilter === "no" &&
        (q.requires_image === false ||
          q.requires_image === 0 ||
          q.requires_image === "0" ||
          !q.requires_image));
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
  } else {
    filtered.forEach((q) => {
      const option = document.createElement("option");
      option.value = q.id;
      let matchStatus =
        q.models_count && q.models_count > 0
          ? q.matching_models / q.models_count === 1
            ? "✅ "
            : q.matching_models / q.models_count >= 0.5
            ? "🟡 "
            : "❌ "
          : "⚪ ";
      let positionDisplay =
        filePathFilter && filePathFilter !== "all" && "array_order" in q
          ? `${q.array_order}${q.source_type === "duplicate" ? " (rep)" : ""}: `
          : `#${q.id}: `;
      let fileInfo =
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
      if (q.status === "verified") option.className = "verified-option";
      else if (q.status === "likely_correct")
        option.className = "likely-option";
      else if (q.status === "needs_review") option.className = "review-option";
      else if (q.status === "incorrect") option.className = "incorrect-option";
      else if (q.status === "corrected") option.className = "corrected-option";
      questionDropdown.appendChild(option);
    });
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
    const response = await fetch(`/api/question/${questionId}`);
    const q = await response.json();
    if (q.error) {
      document.getElementById("output").innerHTML = `<p>${q.error}</p>`;
      return;
    }

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
    const statusColor = {
      verified: "#2ecc71",
      likely_correct: "#f1c40f",
      incorrect: "#ff4757",
      needs_review: "#fd7e14",
      corrected: "#1abc9c",
    };
    const catColor = Dashboard.categoryColorMap[q.category] || "#344767";

    let html = `<p><strong>Status:</strong> <span style="color: ${
      statusColor[q.status] || "#344767"
    }">${
      q.status
    }</span> | <strong>Category:</strong> <span style="color: ${catColor}">${
      q.category
    }</span></p>`;
    if (q.file_path)
      html += ` | <strong>File:</strong> <span title="${
        q.file_path
      }" class="file-path">${q.file_path.split("/").pop()}</span>`;
    html += `</p>`;

    if (q.status !== "corrected") {
      const buttonId = `markCorrectedBtn_${q.id}`;
      html += `<button id="${buttonId}" class="status-button" onclick="Dashboard.handleMarkAsCorrect(${q.id}, '${buttonId}')"><i class="fas fa-check-circle"></i> Mark as Corrected</button>`;
    }

    html += `<p>${q.enhanced_text}</p>`;
    html += `<div class="image-section"><div class="image-requirement ${
      q.requires_image ? "required" : "not-required"
    }"><i class="fas fa-${
      q.requires_image ? "check-circle" : "info-circle"
    }"></i> ${
      q.requires_image
        ? "This question requires an image"
        : "This question does not require an image"
    }</div>`;
    if (q.image_url) {
      html += `<div class="image-container"><img src="${q.image_url}" alt="Question Image" class="question-image" onclick="Dashboard.openImageModal('${q.image_url}')"/><div class="image-buttons"><button onclick="Dashboard.openImageBrowser(${q.id}, document.getElementById('filePathDropdown').value !== 'all' ? document.getElementById('filePathDropdown').value : null)" class="image-button browse-button"><i class="fas fa-images"></i> Browse Images</button><button onclick="Dashboard.removeImage(${q.id})" class="image-button remove-button"><i class="fas fa-trash"></i> Remove Image</button></div></div>`;
    } else {
      html += `<div class="image-buttons"><button onclick="Dashboard.openImageBrowser(${q.id}, document.getElementById('filePathDropdown').value !== 'all' ? document.getElementById('filePathDropdown').value : null)" class="image-button browse-button"><i class="fas fa-images"></i> Select Image</button></div>`;
    }
    html += `</div>`;

    html += `<div class="section-title">Choices:</div><ul>`;
    const correctIndex = q.is_correct.findIndex(
      (val) => val === true || val === "true" || val === "1" || val === 1
    );
    q.choices.forEach(
      (choice, i) =>
        (html +=
          i === correctIndex
            ? `<li style="background: #e6ffe6; padding: 8px; border-radius: 5px;">✓ ${choice}</li>`
            : `<li>${choice}</li>`)
    );
    html += `</ul>`;

    html += `<div class="section-title" data-toggle="explanation">Explanation: <span>▼</span></div><div class="section-content" id="explanationSection">${
      q.explanation || "No explanation provided."
    }</div>`;
    html += `<div class="section-title" data-toggle="predictions">Model Predictions: <span>▼</span></div><div class="section-content" id="predictionsSection"><div class="predictions-container">`;
    q.verification_results.forEach((pred) => {
      const expectedChoice =
        pred.expected_index >= 0 && pred.expected_index < q.choices.length
          ? q.choices[pred.expected_index]
          : "[unknown]";
      if (pred.error)
        html += `<p class="prediction">❌ ${
          pred.model_name
        }: Error - ${pred.error.substring(0, 50)}...</p>`;
      else if (pred.matches_expected)
        html += `<p class="prediction">✅ ${
          pred.model_name
        }: <span style="color: #4c6fff; font-weight: bold">${
          q.choices[pred.selected_index]
        }</span></p>`;
      else if (
        pred.selected_index >= 0 &&
        pred.selected_index < q.choices.length
      )
        html += `<p class="prediction">❌ ${
          pred.model_name
        }: <span style="color: #4c6fff; font-weight: bold">${
          q.choices[pred.selected_index]
        }</span> (Expected: ${expectedChoice})</p>`;
      else if (pred.selected_index === -1)
        html += `<p class="prediction">❓ ${pred.model_name}: None correct${
          pred.suggested_answer ? ` - Suggested: ${pred.suggested_answer}` : ""
        } (Expected: ${expectedChoice})</p>`;
      else if (pred.selected_index === -2)
        html += `<p class="prediction">❓ ${
          pred.model_name
        }: No clear selection${
          pred.suggested_answer ? `: "${pred.suggested_answer}"` : ""
        } (Expected: ${expectedChoice})</p>`;
      else
        html += `<p class="prediction">❌ ${pred.model_name}: Invalid selection (Expected: ${expectedChoice})</p>`;
    });
    html += `</div></div>`;

    const agreementCount = q.verification_results.filter(
      (p) => p.matches_expected
    ).length;
    let consensus =
      agreementCount === q.models_count
        ? "Full Consensus ✅"
        : agreementCount > q.models_count / 2
        ? `Majority Agreement ⚠️ (${agreementCount}/${q.models_count})`
        : agreementCount === 0
        ? "No Agreement ❌"
        : `Minority Agreement ❌ (${agreementCount}/${q.models_count})`;
    let consensusClass =
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
    console.error("Error fetching details:", err);
    document.getElementById("output").innerHTML =
      "<p>Error loading details.</p>";
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
    if (result.status === "success") {
      await Dashboard.fetchQuestions();
      Dashboard.loadFilters();
      Dashboard.displayQuestionDetails(questionId);
    } else throw new Error(result.error || "Unknown error");
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

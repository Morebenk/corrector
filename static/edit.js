function updateChoiceRadioValues(choicesList) {
  Array.from(choicesList.children).forEach((container, i) => {
    const radio = container.querySelector('input[type="radio"]');
    radio.value = i;
    const choiceInput = container.querySelector('input[type="text"]');
    choiceInput.name = `choice_${i}`;
  });
}

Dashboard.renderEditForm = function (q) {
  const container = document.getElementById("output");
  container.innerHTML = "";
  const form = document.createElement("form");
  form.id = "editForm";

  const stickyHeader = document.createElement("div");
  stickyHeader.classList.add("edit-sticky-header");
  const headerContent = document.createElement("div");
  headerContent.classList.add("edit-header-content");
  const title = document.createElement("h2");
  title.textContent = `Editing Question ${q.id}`;
  headerContent.appendChild(title);
  const statusBadge = document.createElement("span");
  statusBadge.classList.add("edit-status-badge", q.status);
  statusBadge.textContent = q.status;
  headerContent.appendChild(statusBadge);
  const btnDiv = document.createElement("div");
  btnDiv.classList.add("edit-actions");

  const cleanupNavWarning = () =>
    window.removeEventListener("beforeunload", beforeUnloadHandler);

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.innerHTML =
    '<i class="fas fa-times"></i> <span class="button-text">Cancel</span>';
  cancelButton.classList.add("form-button", "cancel");
  cancelButton.addEventListener("click", () => {
    if (
      form.dataset.hasChanges === "true" &&
      !confirm("You have unsaved changes. Are you sure you want to cancel?")
    )
      return;
    cleanupNavWarning();
    Dashboard.displayQuestionDetails(q.id);
  });

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.innerHTML =
    '<i class="fas fa-save"></i> <span class="button-text">Save Changes</span>';
  saveButton.classList.add("form-button", "save");
  saveButton.addEventListener("click", async () => {
    const success = await Dashboard.saveEdits(q.id);
    if (success) cleanupNavWarning();
  });

  const saveAndMarkButton = document.createElement("button");
  saveAndMarkButton.type = "button";
  saveAndMarkButton.innerHTML =
    '<i class="fas fa-check-double"></i> <span class="button-text">Save & Mark Correct</span>';
  saveAndMarkButton.classList.add("form-button", "save-mark");
  saveAndMarkButton.addEventListener("click", async () => {
    if (await Dashboard.saveEdits(q.id, true)) {
      await fetch(`/api/question/${q.id}/mark-corrected`, { method: "POST" });

      // Update local data
      const question = Dashboard.questionsData.find((q_) => q_.id === q.id);
      if (question) {
        question.status = "corrected";
      }

      // Clear cache for this question
      const filePathFilter = document.getElementById("filePathDropdown").value;
      const cacheKey = `${q.id}-${filePathFilter}`;
      delete Dashboard.questionDetailsCache[cacheKey];

      // Re-render with updated data and move to next question
      const currentIndex = [
        ...document.getElementById("questionDropdown").options,
      ].findIndex((option) => parseInt(option.value) === q.id);

      Dashboard.populateQuestions();

      // Move to next question
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

      cleanupNavWarning();
    }
  });

  btnDiv.appendChild(saveButton);
  btnDiv.appendChild(saveAndMarkButton);
  btnDiv.appendChild(cancelButton);
  headerContent.appendChild(btnDiv);
  stickyHeader.appendChild(headerContent);
  form.appendChild(stickyHeader);

  const originalValues = {
    text: q.enhanced_text,
    category: q.category,
    explanation: q.explanation || "",
    requires_image: q.requires_image,
    correct_index: q.is_correct.findIndex((val) => val === "true"),
    choices: [...q.choices],
  };

  const checkFormChanges = () => {
    const currentText = form.querySelector(
      'textarea[name="enhanced_text"]'
    ).value;
    const currentCategory = form.querySelector('select[name="category"]').value;
    const currentExplanation = form.querySelector(
      'textarea[name="explanation"]'
    ).value;
    const currentRequiresImage = form.querySelector(
      'input[name="requires_image"]'
    ).checked;
    const currentChoices = Array.from(
      form.querySelectorAll('input[name^="choice_"]')
    ).map((input) => input.value);
    const currentCorrectIndex = parseInt(
      form.querySelector('input[name="correct_choice"]:checked')?.value || -1
    );

    const hasChanges =
      currentText !== originalValues.text ||
      currentCategory !== originalValues.category ||
      currentExplanation !== originalValues.explanation ||
      currentRequiresImage !== originalValues.requires_image ||
      currentCorrectIndex !== originalValues.correct_index ||
      !currentChoices.every(
        (choice, i) => choice === originalValues.choices[i]
      ) ||
      currentChoices.length !== originalValues.choices.length;
    form.dataset.hasChanges = hasChanges;
    stickyHeader.dataset.unsaved = hasChanges;
  };

  form.addEventListener("input", checkFormChanges);
  form.addEventListener("change", checkFormChanges);

  const beforeUnloadHandler = (e) => {
    if (form.dataset.hasChanges === "true") {
      e.preventDefault();
      e.returnValue = "";
    }
  };
  window.addEventListener("beforeunload", beforeUnloadHandler);

  const textDiv = document.createElement("div");
  textDiv.classList.add("form-field");
  textDiv.innerHTML = `<label><strong>Question Text:</strong></label>`;
  const textArea = document.createElement("textarea");
  textArea.name = "enhanced_text";
  textArea.style.height = "150px";
  textArea.value = q.enhanced_text;
  textDiv.appendChild(textArea);
  form.appendChild(textDiv);

  const categoryDiv = document.createElement("div");
  categoryDiv.classList.add("form-field");
  categoryDiv.innerHTML = `<label><strong>Category:</strong></label>`;
  const categorySelect = document.createElement("select");
  categorySelect.name = "category";
  Dashboard.uniqueCategories.forEach((cat) => {
    const option = document.createElement("option");
    option.value = cat;
    option.textContent = cat;
    if (cat === q.category) option.selected = true;
    categorySelect.appendChild(option);
  });
  categoryDiv.appendChild(categorySelect);
  form.appendChild(categoryDiv);

  const imageDiv = document.createElement("div");
  imageDiv.classList.add("form-field", "image-section");
  imageDiv.innerHTML = `<label class="checkbox-label"><input type="checkbox" name="requires_image" ${
    q.requires_image ? "checked" : ""
  }><span><strong>Requires Image</strong></span></label>`;
  const imageContentDiv = document.createElement("div");
  imageContentDiv.classList.add("image-content");
  if (q.image_url) {
    imageContentDiv.innerHTML = `
      <div class="image-container">
        <img src="${q.image_url}" alt="Question Image" class="question-image" onclick="Dashboard.openImageModal('${q.image_url}')"/>
        <button type="button" onclick="Dashboard.removeImage(${q.id})" class="image-remove-btn"><i class="fas fa-trash"></i> Remove Image</button>
      </div>
    `;
  } else {
    imageContentDiv.innerHTML = `
      <div class="image-upload">
        <label for="imageFile" class="image-upload-label"><i class="fas fa-cloud-upload-alt"></i> Upload Image</label>
        <input type="file" id="imageFile" accept="image/*" onchange="Dashboard.uploadImage(${q.id}, this)" style="display: none;"/>
      </div>
    `;
  }
  imageDiv.appendChild(imageContentDiv);
  form.appendChild(imageDiv);

  const choicesDiv = document.createElement("div");
  choicesDiv.classList.add("form-field");
  choicesDiv.innerHTML = `<label><strong>Choices:</strong></label>`;
  const choicesList = document.createElement("div");
  const correctIndex = q.is_correct.findIndex((val) => val === "true");
  q.choices.forEach((choice, i) => {
    const choiceContainer = document.createElement("div");
    choiceContainer.classList.add("choice-container");
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "correct_choice";
    radio.value = i;
    if (i === correctIndex) radio.checked = true;
    radio.addEventListener("change", checkFormChanges);
    choiceContainer.appendChild(radio);
    const choiceInput = document.createElement("input");
    choiceInput.type = "text";
    choiceInput.name = `choice_${i}`;
    choiceInput.value = choice;
    choiceContainer.appendChild(choiceInput);
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.innerHTML = '<i class="fas fa-trash"></i>';
    removeButton.classList.add("remove-choice");
    removeButton.addEventListener("click", () => {
      choicesList.removeChild(choiceContainer);
      updateChoiceRadioValues(choicesList);
      checkFormChanges();
    });
    choiceContainer.appendChild(removeButton);
    choicesList.appendChild(choiceContainer);
  });

  const addChoiceButton = document.createElement("button");
  addChoiceButton.type = "button";
  addChoiceButton.textContent = "Add Choice";
  addChoiceButton.addEventListener("click", () => {
    const i = choicesList.children.length;
    const choiceContainer = document.createElement("div");
    choiceContainer.classList.add("choice-container");
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "correct_choice";
    radio.value = i;
    choiceContainer.appendChild(radio);
    const choiceInput = document.createElement("input");
    choiceInput.type = "text";
    choiceInput.name = `choice_${i}`;
    choiceContainer.appendChild(choiceInput);
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.innerHTML = '<i class="fas fa-trash"></i>';
    removeButton.classList.add("remove-choice");
    removeButton.addEventListener("click", () => {
      choicesList.removeChild(choiceContainer);
      updateChoiceRadioValues(choicesList);
      checkFormChanges();
    });
    choiceContainer.appendChild(removeButton);
    choicesList.appendChild(choiceContainer);
    radio.addEventListener("change", checkFormChanges);
    choiceInput.addEventListener("input", checkFormChanges);
    checkFormChanges();
  });
  choicesDiv.appendChild(choicesList);
  choicesDiv.appendChild(addChoiceButton);
  form.appendChild(choicesDiv);

  const explanationDv = document.createElement("div");
  explanationDv.classList.add("form-field");
  explanationDv.innerHTML = `<label><strong>Explanation:</strong></label>`;
  const explanationArea = document.createElement("textarea");
  explanationArea.name = "explanation";
  explanationArea.style.height = "150px";
  explanationArea.value = q.explanation || "";
  explanationDv.appendChild(explanationArea);

  const generateButton = document.createElement("button");
  generateButton.type = "button";
  generateButton.innerHTML =
    '<i class="fas fa-magic"></i> Generate Explanation';
  generateButton.classList.add("generate-explanation");
  generateButton.addEventListener("click", async () => {
    const questionText = form.querySelector(
      'textarea[name="enhanced_text"]'
    ).value;
    const choiceInputs = form.querySelectorAll('input[name^="choice_"]');
    const choices = Array.from(choiceInputs).map((input) => input.value.trim());
    const correctChoice = form.querySelector(
      'input[name="correct_choice"]:checked'
    );
    if (!correctChoice) {
      alert("Please select a correct choice before generating an explanation.");
      return;
    }
    const correctIndex = parseInt(correctChoice.value);

    try {
      const response = await fetch("/api/generate_explanation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_text: questionText,
          choices,
          correct_index: correctIndex,
        }),
      });
      const result = await response.json();
      if (result.status === "success") {
        explanationArea.value = result.explanation;
        checkFormChanges();
      } else {
        alert("Failed to generate explanation: " + result.error);
      }
    } catch (err) {
      Dashboard.showError("Error generating explanation.");
    }
  });
  explanationDv.appendChild(generateButton);
  form.appendChild(explanationDv);

  container.appendChild(form);
};

Dashboard.saveEdits = async function (questionId, skipSuccessMessage = false) {
  const form = document.getElementById("editForm");
  const formData = new FormData(form);
  const enhancedText = formData.get("enhanced_text");
  const category = formData.get("category");
  const explanation = formData.get("explanation");

  const choicesList = form.querySelectorAll('input[name^="choice_"]');
  if (choicesList.length === 0) {
    alert("Please add at least one choice.");
    return false;
  }
  const correctChoice = form.querySelector(
    'input[name="correct_choice"]:checked'
  );
  if (!correctChoice) {
    alert("Please select a correct choice.");
    return false;
  }
  const correctIndex = parseInt(correctChoice.value);
  const choices = Array.from(choicesList).map((input, i) => ({
    text: input.value.trim(),
    is_correct: i === correctIndex,
  }));
  if (choices.some((choice) => !choice.text)) {
    alert("All choices must have text.");
    return false;
  }

  const data = {
    enhanced_text: enhancedText,
    category,
    explanation,
    requires_image: form.querySelector('input[name="requires_image"]').checked,
    choices,
  };

  try {
    const response = await fetch(`/api/question/${questionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    if (result.status === "success") {
      form.dataset.hasChanges = "false";
      if (!skipSuccessMessage) alert("Update successful!");

      // Clear the cache entry for this question
      const filePathFilter = document.getElementById("filePathDropdown").value;
      const cacheKey = `${questionId}-${filePathFilter}`;
      delete Dashboard.questionDetailsCache[cacheKey];

      // Update the question in questionsData
      const question = Dashboard.questionsData.find((q) => q.id === questionId);
      if (question) {
        question.enhanced_text = data.enhanced_text;
        question.category = data.category;
        question.requires_image = data.requires_image;
        question.status = data.status || question.status;
      }

      // Only reload questions if needed
      if (!skipSuccessMessage) {
        // Re-render the current view with updated data
        Dashboard.populateQuestions();
        Dashboard.displayQuestionDetails(questionId);
      }
      return true;
    } else {
      alert("Update failed: " + (result.error || "Unknown error"));
      return false;
    }
  } catch (err) {
    Dashboard.showError("Error updating question.");
    return false;
  }
};

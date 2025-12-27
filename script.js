
import { CONFIG } from './config.js';

let ID_TOKEN = ""; 
let fetchedDocuments = []; 

/**
AUTHENTICATION
 */
async function loginUser(email, password) {
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${CONFIG.API_KEY}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error.message);
    return data.idToken;
}

/**
DATA RETRIEVAL (READ)
 */
async function fetchCollectionData(collectionName) {
    const url = `https://firestore.googleapis.com/v1/projects/${CONFIG.PROJECT_ID}/databases/(default)/documents/${collectionName}`;
    const response = await fetch(url, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${ID_TOKEN}` }
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error.message);
    return data.documents || [];
}

/**
DATA DELETION (DELETE)
 */
async function deleteDocument(docPath) {
    const url = `https://firestore.googleapis.com/v1/${docPath}`;
    const response = await fetch(url, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${ID_TOKEN}` }
    });
    if (!response.ok) throw new Error("Failed to delete document");
    return true;
}

/**
DATA UPDATE (UPDATE/PATCH)
 */
async function updateDocument(docPath, docData) {
    // We create a mask to tell Firestore which fields to update
    const updateMask = Object.keys(docData).map(key => `updateMask.fieldPaths=${key}`).join('&');
    const url = `https://firestore.googleapis.com/v1/${docPath}?${updateMask}`;

    const payload = { fields: {} };
    Object.keys(docData).forEach(key => {
        const val = docData[key];
        // Automatic type detection
        if (!isNaN(val) && val.trim() !== "") {
            payload.fields[key] = { integerValue: parseInt(val) };
        } else if (val.toLowerCase() === 'true' || val.toLowerCase() === 'false') {
            payload.fields[key] = { booleanValue: val.toLowerCase() === 'true' };
        } else {
            payload.fields[key] = { stringValue: val };
        }
    });

    const response = await fetch(url, {
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${ID_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "Failed to update document");
    return data;
}

/**
DATA CREATION (CREATE)
 */
async function createDocument(collectionName, docId, docData) {
    let url = `https://firestore.googleapis.com/v1/projects/${CONFIG.PROJECT_ID}/databases/(default)/documents/${collectionName}`;
    if (docId) url += `?documentId=${docId}`;
    
    const payload = { fields: {} };
    Object.keys(docData).forEach(key => {
        const val = docData[key];
        if (!isNaN(val) && val.trim() !== "") {
            payload.fields[key] = { integerValue: parseInt(val) };
        } else {
            payload.fields[key] = { stringValue: val };
        }
    });

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${ID_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "Failed to create document");
    return data;
}

/**
 * DYNAMIC UI RENDERING 
 */
function renderCards(docs) {
    const displayArea = document.getElementById('data-display');
    displayArea.innerHTML = docs.length ? "" : "<p style='text-align: center; color: var(--fb-text-muted); padding: 40px;'>No documents found.</p>";

    docs.forEach(doc => {
        const docId = doc.name.split('/').pop();
        const fields = doc.fields || {};
        
        const card = document.createElement('div');
        card.className = 'data-card';
        
        let fieldsHtml = "";
        Object.keys(fields).forEach(key => {
            const val = fields[key].stringValue || fields[key].integerValue || fields[key].booleanValue || "N/A";
            fieldsHtml += `<div class="field-row"><strong>${key}:</strong> <span>${val}</span></div>`;
        });

        card.innerHTML = `
            <div class="card-header">📄 ${docId}</div>
            <div class="card-body">${fieldsHtml}</div>
            <div class="card-footer">
                <button class="btn-edit-doc" data-id="${docId}" data-path="${doc.name}">✏️ Edit</button>
                <button class="btn-delete-doc" data-path="${doc.name}">🗑️ Delete</button>
            </div>
        `;
        displayArea.appendChild(card);
    });

    // Delete Event Listeners
    document.querySelectorAll('.btn-delete-doc').forEach(btn => {
        btn.onclick = () => { 
            const docId = btn.dataset.path.split('/').pop();
            const docPath = btn.dataset.path;
            
            // Show delete confirmation modal
            document.getElementById('confirm-delete-id').textContent = docId;
            document.getElementById('confirm-delete-modal').classList.remove('hidden');
            
            // Store path for confirmation
            window.pendingDeletePath = docPath;
        };
    });

    // Edit Event Listeners
    document.querySelectorAll('.btn-edit-doc').forEach(btn => {
        btn.onclick = () => {
            const docPath = btn.dataset.path;
            const docId = btn.dataset.id;
            const doc = fetchedDocuments.find(d => d.name === docPath);
            
            // Trigger open modal
            document.getElementById('open-add-modal').click();
            
            // Switch Modal to Edit Mode
            document.querySelector('#add-modal h3').textContent = "Edit Record";
            document.getElementById('new-id').value = docId;
            document.getElementById('new-id').disabled = true; // ID cannot be edited
            document.getElementById('btn-save').dataset.mode = "edit";
            document.getElementById('btn-save').dataset.editPath = docPath;

            // Pre-fill inputs
            const fields = doc.fields || {};
            document.querySelectorAll('.field-input').forEach(input => {
                const fieldName = input.dataset.fieldName;
                if (fields[fieldName]) {
                    input.value = fields[fieldName].stringValue || fields[fieldName].integerValue || fields[fieldName].booleanValue || "";
                }
            });
        };
    });
}

// --- CONTROLLERS ---

document.getElementById('btn-login').onclick = async () => {
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    try {
        ID_TOKEN = await loginUser(email, pass);
        document.getElementById('auth-section').classList.add('hidden');
        document.getElementById('dashboard').classList.remove('hidden');
    } catch (e) { alert(e.message); }
};

document.getElementById('coll-select').onchange = async () => {
    const coll = document.getElementById('coll-select').value;
    if (!coll) return;
    try {
        fetchedDocuments = await fetchCollectionData(coll);
        renderCards(fetchedDocuments);
        document.getElementById('data-search').disabled = false;
    } catch (e) { alert(e.message); }
};

document.getElementById('btn-fetch').onclick = async () => {
    const coll = document.getElementById('coll-select').value;
    if (!coll) return alert("Select a collection!");
    try {
        fetchedDocuments = await fetchCollectionData(coll);
        renderCards(fetchedDocuments);
    } catch (e) { alert(e.message); }
};

document.getElementById('data-search').oninput = (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = fetchedDocuments.filter(doc => doc.name.split('/').pop().toLowerCase().includes(term));
    renderCards(filtered);
};

document.getElementById('btn-logout').onclick = () => {
    location.reload(); // Simplest way to clear session
};

// Modal Logic
document.getElementById('open-add-modal').onclick = () => {
    const collName = document.getElementById('coll-select').value;
    if (!collName) return alert("Select a collection first!");

    document.getElementById('modal-collection-name').textContent = collName;
    document.querySelector('#add-modal h3').textContent = "Add New Record";
    document.getElementById('new-id').disabled = false;
    document.getElementById('btn-save').dataset.mode = "create";

    const collectionFields = {
        students: [
            { name: 'fname', label: 'First Name', type: 'text', required: true },
            { name: 'lname', label: 'Last Name', type: 'text', required: true },
            { name: 'program', label: 'Program', type: 'text', required: true },
            { name: 'year_level', label: 'Year Level', type: 'number', required: true }
        ],
        instructors: [
            { name: 'full_name', label: 'Name', type: 'text', required: true },
            { name: 'email', label: 'Email', type: 'email', required: true },
            { name: 'department', label: 'Department', type: 'text', required: true }
        ],
        programs: [
            { name: 'name', label: 'Program Name', type: 'text', required: true },
            { name: 'department', label: 'Department', type: 'text', required: true },
            { name: 'program_code', label: 'Program Code', type: 'text', required: true }
        ]
    };

    const container = document.getElementById('dynamic-fields-container');
    container.innerHTML = '';
    (collectionFields[collName] || []).forEach(field => {
        const div = document.createElement('div');
        div.className = 'form-field';
        div.innerHTML = `
            <label>${field.label} ${field.required ? '*' : ''}</label>
            <input type="${field.type}" class="field-input" data-field-name="${field.name}" placeholder="Enter ${field.label}" ${field.required ? 'required' : ''}>
        `;
        container.appendChild(div);
    });

    document.getElementById('add-modal').classList.remove('hidden');
};

document.getElementById('btn-cancel').onclick = () => {
    document.getElementById('add-modal').classList.add('hidden');
    document.getElementById('new-id').value = "";
};

document.getElementById('btn-save').onclick = async () => {
    const coll = document.getElementById('coll-select').value;
    const mode = document.getElementById('btn-save').dataset.mode;
    const docId = document.getElementById('new-id').value.trim();
    
    const docData = {};
    let isValid = true;
    
    document.querySelectorAll('.field-input').forEach(input => {
        const fieldName = input.dataset.fieldName;
        const value = input.value.trim();
        if (input.hasAttribute('required') && !value) isValid = false;
        if (value) docData[fieldName] = value;
    });

    if (!isValid) return alert("Please fill required fields!");

    // Store data for confirmation
    window.pendingSaveData = { coll, mode, docId, docData };

    // Show confirmation modal
    const confirmTitle = mode === "edit" ? "Confirm Update Document" : "Confirm Add Document";
    document.getElementById('confirm-add-title').textContent = confirmTitle;
    
    let previewHtml = "";
    Object.keys(docData).forEach(key => {
        previewHtml += `<div style="margin: 8px 0; padding: 8px 0; border-bottom: 1px solid var(--fb-border);"><strong>${key}:</strong> ${docData[key]}</div>`;
    });
    document.getElementById('confirm-add-preview').innerHTML = previewHtml;
    
    document.getElementById('confirm-add-modal').classList.remove('hidden');
};

// Confirmation handlers for add/edit
document.getElementById('btn-confirm-add-cancel').onclick = () => {
    document.getElementById('confirm-add-modal').classList.add('hidden');
};

document.getElementById('btn-confirm-add-proceed').onclick = async () => {
    try {
        const { coll, mode, docId, docData } = window.pendingSaveData;
        
        if (mode === "edit") {
            const editPath = document.getElementById('btn-save').dataset.editPath;
            await updateDocument(editPath, docData);
        } else {
            await createDocument(coll, docId, docData);
        }
        
        document.getElementById('confirm-add-modal').classList.add('hidden');
        document.getElementById('btn-cancel').click();
        document.getElementById('btn-fetch').click();
        
        alert(mode === "edit" ? "Document updated successfully!" : "Document added successfully!");
    } catch (e) { 
        alert("Error: " + e.message); 
    }
};

// Confirmation handlers for delete
document.getElementById('btn-confirm-delete-cancel').onclick = () => {
    document.getElementById('confirm-delete-modal').classList.add('hidden');
    window.pendingDeletePath = null;
};

document.getElementById('btn-confirm-delete-proceed').onclick = async () => {
    try {
        await deleteDocument(window.pendingDeletePath);
        document.getElementById('confirm-delete-modal').classList.add('hidden');
        document.getElementById('btn-fetch').click();
        alert("Document deleted successfully!");
    } catch (e) { 
        alert("Error: " + e.message); 
    }
};
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Modality } from "@google/genai";

// State variables to hold the uploaded image data
let imageBase64: string | null = null;
let imageMimeType: string | null = null;
let editedImageSrc: string | null = null;

// DOM element references
const imageUpload = document.getElementById('image-upload') as HTMLInputElement;
const originalImage = document.getElementById('original-image') as HTMLImageElement;
const uploadPlaceholder = document.getElementById('upload-placeholder') as HTMLParagraphElement;
const promptInput = document.getElementById('prompt-input') as HTMLTextAreaElement;
const promptExamples = document.getElementById('prompt-examples') as HTMLSelectElement;
const editButton = document.getElementById('edit-button') as HTMLButtonElement;
const resultContainer = document.getElementById('result-container') as HTMLDivElement;
const resultPlaceholder = document.getElementById('result-placeholder') as HTMLParagraphElement;
const loader = document.getElementById('loader') as HTMLDivElement;
const downloadButton = document.getElementById('download-button') as HTMLButtonElement;

// Set the initial prompt from the user's request
promptInput.value = 'modifica la imagen y dale un aspecto profesional, donde los colores destaquen y resalten lo mejor de la fotografia';

// Event listener for the example prompts dropdown
promptExamples.addEventListener('change', (event) => {
    const selectedValue = (event.target as HTMLSelectElement).value;
    if (selectedValue) {
        promptInput.value = selectedValue;
    }
});

// Event listener for the file input
imageUpload.addEventListener('change', async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) {
        return;
    }

    try {
        const reader = new FileReader();
        reader.onload = (e) => {
            const result = e.target?.result as string;
            // The result includes the full data URL prefix
            const dataUrlParts = result.split(',');
            if (dataUrlParts.length !== 2) {
                throw new Error('Invalid data URL format');
            }
            const mimeTypePart = dataUrlParts[0].split(':')[1].split(';')[0];
            
            // Store data for API call (base64 without the prefix)
            imageBase64 = dataUrlParts[1];
            imageMimeType = mimeTypePart;

            // Update UI
            originalImage.src = result;
            originalImage.style.display = 'block';
            uploadPlaceholder.classList.add('hidden');
            editButton.disabled = false;
        };
        reader.readAsDataURL(file);
    } catch (error) {
        console.error('Error reading file:', error);
        alert('No se pudo leer el archivo seleccionado. Por favor, intenta con otra imagen.');
    }
});

// Event listener for the edit button
editButton.addEventListener('click', async () => {
    if (!imageBase64 || !imageMimeType) {
        alert('Por favor, sube una imagen primero.');
        return;
    }

    const prompt = promptInput.value;
    if (!prompt.trim()) {
        alert('Por favor, ingresa una instrucción de edición.');
        return;
    }

    await callGemini(prompt, imageBase64, imageMimeType);
});

// Event listener for the download button
downloadButton.addEventListener('click', () => {
    if (!editedImageSrc) {
        alert('No hay imagen editada para descargar.');
        return;
    }

    const a = document.createElement('a');
    a.href = editedImageSrc;
    a.download = 'imagen-editada.png'; // Propose a filename for the download
    document.body.appendChild(a); // Append to body to ensure it's clickable
    a.click();
    document.body.removeChild(a); // Clean up the temporary link
});


// Function to call the Gemini API
async function callGemini(prompt: string, base64Data: string, mimeType: string) {
    // Set loading state
    resultContainer.innerHTML = ''; // Clear previous results
    resultContainer.appendChild(loader);
    loader.classList.remove('hidden');
    editButton.disabled = true;
    downloadButton.classList.add('hidden');
    editedImageSrc = null;


    try {
        // IMPORTANT: The API key is sourced from the environment variable `process.env.API_KEY`
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: {
                parts: [
                    {
                        inlineData: {
                            data: base64Data,
                            mimeType: mimeType,
                        },
                    },
                    { text: prompt },
                ],
            },
            config: {
                responseModalities: [Modality.IMAGE, Modality.TEXT],
            },
        });

        // Clear loader and placeholder
        resultContainer.innerHTML = '';

        if (response.candidates && response.candidates.length > 0) {
            let foundContent = false;
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                    const img = document.createElement('img');
                    const imageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                    img.src = imageUrl;
                    img.alt = prompt;
                    resultContainer.appendChild(img);
                    
                    // Store for download and show the button
                    editedImageSrc = imageUrl;
                    downloadButton.classList.remove('hidden');

                    foundContent = true;
                } else if (part.text) {
                    const p = document.createElement('p');
                    p.textContent = part.text;
                    p.className = 'model-text';
                    resultContainer.appendChild(p);
                    foundContent = true;
                }
            }
            if (!foundContent) {
                displayError('El modelo no devolvió ningún contenido editable.');
            }
        } else {
            displayError('No hubo respuesta del modelo. Por favor, inténtalo de nuevo.');
        }

    } catch (error) {
        console.error("Error calling Gemini API:", error);
        displayError('Ocurrió un error. Por favor, revisa la consola para más detalles.');
    } finally {
        loader.classList.add('hidden');
        editButton.disabled = false;
    }
}

function displayError(message: string) {
    resultContainer.innerHTML = '';
    const errorP = document.createElement('p');
    errorP.textContent = message;
    errorP.className = 'error';
    resultContainer.appendChild(errorP);
    downloadButton.classList.add('hidden'); // Hide download button on error
}
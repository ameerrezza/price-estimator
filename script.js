document.addEventListener('DOMContentLoaded', () => {

    function generateQuoteId() {
        const random = Math.floor(100000 + Math.random() * 900000);
        return "KG-" + random;
    }

    const pricingData = {
        "Batik Totebag Reversible": { 50: 49, 100: 42, 300: 36, 500: 32, 1000: 29 },
        "Batik Mini Doorgift": { 50: 49, 100: 42, 300: 36, 500: 32, 1000: 29 },
        "Batik Notebook": { 50: 49, 100: 42, 300: 36, 500: 32, 1000: 29 },
        "Batik Kipas Tangan w Cover": { 50: 29, 100: 24, 300: 20, 500: 18, 1000: 16 },
        "Batik Zipper Bag / Foldable": { 50: 59, 100: 49, 300: 42, 500: 38, 1000: 34 },
        "Batik Lanyard Holder": { 50: 59, 100: 49, 300: 42, 500: 38, 1000: 34 },
        "Batik Passport Holder": { 50: 59, 100: 49, 300: 42, 500: 38, 1000: 34 }
    };

    const productSelect = document.getElementById('product');
    const quantityInput = document.getElementById('quantity');
    const timelineSelect = document.getElementById('timeline');
    const themeToggle = document.getElementById('theme-toggle');
    const body = document.body;

    const quantityHint = document.getElementById('quantity-hint');
    const savingsMessage = document.getElementById('savings-message');
    const customProductContainer = document.getElementById('custom-product-container');
    const customProductInput = document.getElementById('custom-product');
    const tailoredQuoteMsg = document.getElementById('tailored-quote-msg');
    const pricingBoxContainer = document.getElementById('pricing-box-container');
    const interactiveFieldsContainer = document.getElementById('interactive-fields-container');
    const emptyStateContainer = document.getElementById('empty-state-container');

    const addonLogo = document.getElementById('addon-logo');
    const addonCard = document.getElementById('addon-card');
    const addonPackaging = document.getElementById('addon-packaging');

    const unitPriceDisplay = document.getElementById('unit-price');
    const totalPriceDisplay = document.getElementById('total-price');
    const depositPriceDisplay = document.getElementById('deposit-price');
    const balancePriceDisplay = document.getElementById('balance-price');
    const depositSection = document.getElementById('deposit-section');
    const pricingNote = document.getElementById('pricing-note');

    const leadForm = document.getElementById('lead-form');
    const estimatorPanel = document.querySelector('.estimator-panel');
    const leadSection = document.getElementById('lead-section');
    const successMessage = document.getElementById('success-message');
    const resetBtn = document.getElementById('reset-btn');
    const estimatorForm = document.getElementById('estimator-form');
    const backToCalcBtn = document.getElementById('back-to-calc-btn');

    const previewSection = document.getElementById('preview-section');
    const confirmQuoteBtn = document.getElementById('confirm-quote-btn');
    const editDetailsBtn = document.getElementById('edit-details-btn');

    let currentUnitPrice = 0;
    let currentTotalPrice = 0;
    let currentPayload = null;

    // Theme Management
    const initTheme = () => {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            body.classList.add('dark');
        }
    };

    themeToggle.addEventListener('click', () => {
        body.classList.toggle('dark');
        localStorage.setItem('theme', body.classList.contains('dark') ? 'dark' : 'light');
    });

    initTheme();

    const formatCurrency = (amount) => {
        return `RM\u00A0${amount.toLocaleString('en-MY', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })}`;
    };

    function resetDynamicFields() {
        if (productSelect.value !== 'other') {
            customProductInput.value = '';
        }
        quantityInput.value = '';
        quantityHint.textContent = "";
    }

    function renderProductFields() {
        const product = productSelect.value;
        if (product === 'other') {
            customProductContainer.classList.remove('hidden');
        } else {
            customProductContainer.classList.add('hidden');
        }
    }

    function handleProductChange() {
        resetDynamicFields();
        renderProductFields();
        updatePrice();
    }

    const updatePrice = () => {
        const product = productSelect.value;
        const quantity = parseInt(quantityInput.value) || 0;

        if (!product) {
            emptyStateContainer.classList.remove('hidden');
            pricingBoxContainer.classList.add('hidden');
            interactiveFieldsContainer.classList.add('hidden');
            tailoredQuoteMsg.classList.add('hidden');
            backToCalcBtn.classList.add('hidden');
            savingsMessage.classList.add('hidden');
            quantityHint.textContent = "";
            return;
        }

        if (product === 'other') {
            emptyStateContainer.classList.add('hidden');
            interactiveFieldsContainer.classList.remove('hidden');
            pricingBoxContainer.classList.add('hidden');
            tailoredQuoteMsg.classList.add('hidden');
            backToCalcBtn.classList.remove('hidden');
            return;
        }

        backToCalcBtn.classList.add('hidden');

        if (!quantity) {
            emptyStateContainer.classList.remove('hidden');
            pricingBoxContainer.classList.add('hidden');
            interactiveFieldsContainer.classList.add('hidden');
            return;
        }

        emptyStateContainer.classList.add('hidden');
        interactiveFieldsContainer.classList.remove('hidden');
        pricingBoxContainer.classList.remove('hidden');
        tailoredQuoteMsg.classList.add('hidden');

        let tier = 50;
        if (quantity >= 1000) tier = 1000;
        else if (quantity >= 500) tier = 500;
        else if (quantity >= 300) tier = 300;
        else if (quantity >= 100) tier = 100;

        let basePrice = pricingData[product][tier] || 0;

        const bestPrice = pricingData[product][1000];
        if (tier < 1000) {
            const savings = basePrice - bestPrice;
            savingsMessage.textContent = `Save ${formatCurrency(savings)}/unit at 1000+ pcs`;
            savingsMessage.classList.remove('hidden');
        } else {
            savingsMessage.classList.add('hidden');
        }

        let hint = "";
        if (quantity >= 1000) hint = "Best price applied (1000+)";
        else if (quantity >= 500) hint = "Better pricing unlocked (500+)";
        else if (quantity >= 300) hint = "Better pricing unlocked (300+)";
        else if (quantity >= 100) hint = "Better pricing unlocked (100+)";
        else hint = "Increase quantity for better pricing";

        if (timelineSelect.value === "Urgent") {
            hint += " • Urgent +RM5/unit";
        }

        quantityHint.textContent = hint;

        const addonsGroup = document.getElementById('addons-group');
        const addonWarning = document.getElementById('addon-warning');
        let addonTotal = 0;
        
        if (quantity < 50 && product !== 'other') {
            addonLogo.checked = false;
            addonCard.checked = false;
            addonPackaging.checked = false;
            
            addonLogo.disabled = true;
            addonCard.disabled = true;
            addonPackaging.disabled = true;
            
            if (addonsGroup) {
                addonsGroup.style.opacity = '0.5';
                addonsGroup.style.pointerEvents = 'none';
            }
            if (addonWarning) addonWarning.classList.remove('hidden');
        } else {
            addonLogo.disabled = false;
            addonCard.disabled = false;
            addonPackaging.disabled = false;
            
            if (addonsGroup) {
                addonsGroup.style.opacity = '1';
                addonsGroup.style.pointerEvents = 'auto';
            }
            if (addonWarning) addonWarning.classList.add('hidden');
            
            if (addonLogo.checked) addonTotal += 3;
            if (addonCard.checked) addonTotal += 2;
            if (addonPackaging.checked) addonTotal += 5;
        }

        let rushFee = timelineSelect.value === "Urgent" ? 5 : 0;

        currentUnitPrice = basePrice + addonTotal + rushFee;
        currentTotalPrice = currentUnitPrice * quantity;

        unitPriceDisplay.textContent = formatCurrency(currentUnitPrice);
        totalPriceDisplay.textContent = formatCurrency(currentTotalPrice);
        if (depositPriceDisplay && balancePriceDisplay) {
            depositPriceDisplay.textContent = formatCurrency(currentTotalPrice * 0.6);
            balancePriceDisplay.textContent = formatCurrency(currentTotalPrice * 0.4);
        }

        if (depositSection && pricingNote) {
            if (quantity >= 100) {
                depositSection.style.display = 'block';
                pricingNote.innerHTML = `Estimated pricing based on standard specifications.<br>\n                                60% deposit required to confirm order, balance upon completion.<br>\n                                Delivery charges are calculated separately.`;
            } else {
                depositSection.style.display = 'none';
                pricingNote.innerHTML = `Estimated pricing based on standard specifications.<br>\n                                Full payment is required for orders below 100 pcs.<br>\n                                Delivery charges are calculated separately.`;
            }
        }
    };

    productSelect.addEventListener('change', handleProductChange);
    quantityInput.addEventListener('input', updatePrice);
    timelineSelect.addEventListener('change', updatePrice);
    addonLogo.addEventListener('change', updatePrice);
    addonCard.addEventListener('change', updatePrice);
    addonPackaging.addEventListener('change', updatePrice);

    renderProductFields();
    updatePrice();

    backToCalcBtn.addEventListener('click', () => {
        productSelect.value = "";
        handleProductChange();
    });

    // ✅ FIXED SUBMIT FLOW - NOW WITH PREVIEW
    leadForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const product = productSelect.value;
        const addons = [];
        let addonCostPerUnit = 0;
        const addonsDetails = [];
        let quantity = parseInt(quantityInput.value) || 0;

        // Strict Enforcement: If quantity < 50, ignore customization completely
        if (quantity >= 50 && product !== 'other') {
            if (addonLogo.checked) {
                addons.push('Logo Printing');
                addonCostPerUnit += 3;
                addonsDetails.push({ name: 'Logo Printing', price: 3 });
            }
            if (addonCard.checked) {
                addons.push('Custom Card');
                addonCostPerUnit += 2;
                addonsDetails.push({ name: 'Custom Card', price: 2 });
            }
            if (addonPackaging.checked) {
                addons.push('Premium Packaging');
                addonCostPerUnit += 5;
                addonsDetails.push({ name: 'Premium Packaging', price: 5 });
            }
        }
        
        let customAddonTotal = addonCostPerUnit * quantity;
        let customSubtotal = currentTotalPrice - customAddonTotal;
        
        // Setup Date and Quote ID
        const now = new Date();
        const quoteId = generateQuoteId();
        const dateIssuedStr = now.toLocaleDateString('en-MY', { year: 'numeric', month: 'short', day: 'numeric' });
        const validUntilDate = new Date(now.setDate(now.getDate() + 7));
        const validUntilStr = validUntilDate.toLocaleDateString('en-MY', { year: 'numeric', month: 'short', day: 'numeric' });

        currentPayload = {
            quote_id: quoteId,
            name: document.getElementById('name').value,
            company: document.getElementById('company').value,
            phone: document.getElementById('phone').value,
            email: document.getElementById('email').value,
            product: product === 'other' ? "Other/Not Sure" : product,
            customDescription: product === 'other' ? customProductInput.value : "N/A",
            quantity: quantity,
            timeline: timelineSelect ? timelineSelect.value : "Normal",
            addons: addons,
            unitPrice: product === 'other' ? "Custom" : formatCurrency(currentUnitPrice),
            subtotal: formatCurrency(customSubtotal),
            addons_total: formatCurrency(customAddonTotal),
            totalPrice: product === 'other' ? "Custom" : formatCurrency(currentTotalPrice)
        };

        // Populate Preview Meta
        document.getElementById('preview-quote-id').textContent = currentPayload.quote_id;
        document.getElementById('preview-date-issued').textContent = dateIssuedStr;
        document.getElementById('preview-valid-until').textContent = validUntilStr;

        // Populate Delivery Info
        document.getElementById('preview-name').textContent = currentPayload.name;
        document.getElementById('preview-company').textContent = currentPayload.company || "N/A";
        document.getElementById('preview-phone').textContent = currentPayload.phone;
        document.getElementById('preview-email').textContent = currentPayload.email;
        
        // Populate Order details
        document.getElementById('preview-product').textContent = currentPayload.product;
        document.getElementById('preview-quantity').textContent = currentPayload.quantity + " pcs";
        document.getElementById('preview-unit-price').textContent = currentPayload.unitPrice;
        
        // Populate Addons
        const addonsContainer = document.getElementById('preview-addons-container');
        addonsContainer.innerHTML = '';
        if (addonsDetails.length > 0 && product !== 'other') {
            addonsDetails.forEach(item => {
                const row = document.createElement('div');
                row.className = 'addon-item';
                const totalAddonItemPrice = item.price * quantity;
                row.innerHTML = `<span>${item.name}: RM ${item.price} &times; ${quantity}</span><span>+ ${formatCurrency(totalAddonItemPrice)}</span>`;
                addonsContainer.appendChild(row);
            });
        } else {
            addonsContainer.innerHTML = '<p class="no-addons">None</p>';
        }
        
        if (product === 'other') {
            document.getElementById('preview-subtotal').textContent = "Custom";
            document.getElementById('preview-addons-total').textContent = "Custom";
            document.getElementById('preview-final-total').textContent = "Custom";
        } else {
            document.getElementById('preview-subtotal').textContent = formatCurrency(customSubtotal);
            document.getElementById('preview-addons-total').textContent = formatCurrency(customAddonTotal);
            document.getElementById('preview-final-total').textContent = formatCurrency(currentTotalPrice);
        }

        // Show Preview
        estimatorPanel.style.display = 'none';
        leadSection.style.display = 'none';
        previewSection.classList.remove('hidden');

        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Flow: Edit Details
    editDetailsBtn.addEventListener('click', () => {
        previewSection.classList.add('hidden');
        estimatorPanel.style.display = 'block';
        leadSection.style.display = 'block';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Flow: Confirm & Generate Official Quotation
    confirmQuoteBtn.addEventListener('click', async () => {
        const confirmBtnOriginalText = confirmQuoteBtn.innerHTML;
        
        try {
            confirmQuoteBtn.innerHTML = '<span>Submitting...</span>';
            confirmQuoteBtn.disabled = true;

            const quoteId = currentPayload.quote_id; // Ensures single generation flows perfectly
            const addonsText = Array.isArray(currentPayload.addons) ? currentPayload.addons.join(', ') : currentPayload.addons;

            await fetch('https://hook.eu2.make.com/r7xytg9xmljdx4fks2cpxqyp6lc1y3mx', {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    name: currentPayload.name,
                    company: currentPayload.company,
                    phone: currentPayload.phone,
                    email: currentPayload.email,
                    product: currentPayload.product,
                    quantity: currentPayload.quantity,
                    unitPrice: currentPayload.unitPrice,
                    subtotal: currentPayload.subtotal,
                    addons: encodeURIComponent(addonsText),
                    addonsTotal: currentPayload.addons_total,
                    total: currentPayload.totalPrice,
                    quote_id: quoteId
                })
            });

            setTimeout(() => {
                previewSection.classList.add('hidden');
                successMessage.classList.remove('hidden');

                confirmQuoteBtn.innerHTML = confirmBtnOriginalText;
                confirmQuoteBtn.disabled = false;
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }, 500);

        } catch (error) {
            console.error('Submission error:', error);
            // Fallback success UI
            previewSection.classList.add('hidden');
            successMessage.classList.remove('hidden');
            confirmQuoteBtn.innerHTML = confirmBtnOriginalText;
            confirmQuoteBtn.disabled = false;
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });

    resetBtn.addEventListener('click', () => {
        estimatorForm.reset();
        leadForm.reset();
        handleProductChange();

        successMessage.classList.add('hidden');
        estimatorPanel.style.display = 'block';
        leadSection.style.display = 'block';

        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    const whatsappBtn = document.getElementById('whatsapp-confirm-btn');
    if (whatsappBtn) {
        whatsappBtn.addEventListener('click', () => {
            const quoteIdText = currentPayload && currentPayload.quote_id ? currentPayload.quote_id : 'Unknown';
            const message = `Hi KUL Gifts, I would like to proceed with my quotation (Quote ID: ${quoteIdText})`;

            const encodedMessage = encodeURIComponent(message);
            window.open(`https://wa.me/60182630390?text=${encodedMessage}`, '_blank');
        });
    }

});

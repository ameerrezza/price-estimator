document.addEventListener('DOMContentLoaded', () => {

    const pricingData = {
        "Batik Totebag Reversible": { 50: 49, 100: 45, 300: 42, 500: 40, 1000: 38 },
        "Batik Mini Doorgift": { 50: 46, 100: 42, 300: 38, 500: 36, 1000: 34 },
        "Batik Notebook": { 50: 42, 100: 38, 300: 35, 500: 33, 1000: 31 },
        "Batik Kipas Tangan w Cover": { 50: 22, 100: 19, 300: 16, 500: 15, 1000: 14 },
        "Batik Zipper Bag / Foldable": { 50: 49, 100: 45, 300: 40, 500: 38, 1000: 36 },
        "Batik Lanyard Holder": { 50: 45, 100: 40, 300: 35, 500: 33, 1000: 31 },
        "Batik Passport Holder": { 50: 50, 100: 46, 300: 42, 500: 40, 1000: 38 }
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

    let currentUnitPrice = 0;
    let currentTotalPrice = 0;

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

    const calculatePricing = () => {
        const product = productSelect.value;
        const quantity = parseInt(quantityInput.value) || 0;

        if (!product) {
            emptyStateContainer.classList.remove('hidden');
            pricingBoxContainer.classList.add('hidden');
            interactiveFieldsContainer.classList.add('hidden');
            customProductContainer.classList.add('hidden');
            tailoredQuoteMsg.classList.add('hidden');
            backToCalcBtn.classList.add('hidden');
            savingsMessage.classList.add('hidden');
            quantityHint.textContent = "";
            return;
        }

        if (product === 'other') {
            emptyStateContainer.classList.add('hidden');
            interactiveFieldsContainer.classList.remove('hidden');
            customProductContainer.classList.remove('hidden');
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
        customProductContainer.classList.add('hidden');

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

        let addonTotal = 0;
        if (addonLogo.checked) addonTotal += 3;
        if (addonCard.checked) addonTotal += 2;
        if (addonPackaging.checked) addonTotal += 5;

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

    productSelect.addEventListener('change', calculatePricing);
    quantityInput.addEventListener('input', calculatePricing);
    timelineSelect.addEventListener('change', calculatePricing);
    addonLogo.addEventListener('change', calculatePricing);
    addonCard.addEventListener('change', calculatePricing);
    addonPackaging.addEventListener('change', calculatePricing);

    calculatePricing();

    backToCalcBtn.addEventListener('click', () => {
        productSelect.value = "";
        calculatePricing();
    });

    // ✅ FIXED SUBMIT FLOW
    leadForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const product = productSelect.value;
        const addons = [];
        if (product !== 'other') {
            if (addonLogo.checked) addons.push('Logo Printing');
            if (addonCard.checked) addons.push('Custom Card');
            if (addonPackaging.checked) addons.push('Premium Packaging');
        }

        const payload = {
            name: document.getElementById('name').value,
            company: document.getElementById('company').value,
            phone: document.getElementById('phone').value,
            email: document.getElementById('email').value,
            product: product === 'other' ? "Other/Not Sure" : product,
            customDescription: product === 'other' ? customProductInput.value : "N/A",
            quantity: parseInt(quantityInput.value) || 0,
            timeline: timelineSelect ? timelineSelect.value : "Normal",
            addons: addons,
            unitPrice: product === 'other' ? "Custom" : formatCurrency(currentUnitPrice),
            totalPrice: product === 'other' ? "Custom" : formatCurrency(currentTotalPrice)
        };

        const submitBtn = document.getElementById('submit-lead-btn');
        const originalBtnText = submitBtn.innerHTML;

        try {
            submitBtn.innerHTML = '<span>Submitting...</span>';
            submitBtn.disabled = true;

            // Send payload to Make.com Webhook
            await fetch('https://hook.eu2.make.com/r7xytg9xmijdx4fks2cpxqyp6lc1y3mx', {
                method: 'POST',
                mode: 'no-cors',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            // Small delay to ensure browser initiates submission before hiding UI
            setTimeout(() => {
                estimatorPanel.style.display = 'none';
                leadSection.style.display = 'none';
                successMessage.classList.remove('hidden');

                submitBtn.innerHTML = originalBtnText;
                submitBtn.disabled = false;
            }, 500);

        } catch (error) {
            console.error('Submission error:', error);
            // Fallback success UI
            estimatorPanel.style.display = 'none';
            leadSection.style.display = 'none';
            successMessage.classList.remove('hidden');
            submitBtn.innerHTML = originalBtnText;
            submitBtn.disabled = false;
        }
    });

    resetBtn.addEventListener('click', () => {
        estimatorForm.reset();
        leadForm.reset();
        calculatePricing();

        successMessage.classList.add('hidden');
        estimatorPanel.style.display = 'block';
        leadSection.style.display = 'block';

        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    const whatsappBtn = document.getElementById('whatsapp-confirm-btn');
    if (whatsappBtn) {
        whatsappBtn.addEventListener('click', () => {
            let product = productSelect.value || 'Not specified';
            if (product === 'other') {
                product = customProductInput.value || 'Other/Not sure';
            }
            const quantity = quantityInput.value || '0';
            const total = totalPriceDisplay.textContent || 'RM 0.00';
            const timeline = timelineSelect ? timelineSelect.value : 'Not specified';

            const message = `Hi KUL Gifts, I’d like to confirm this order:\n\nProduct: ${product}\nQuantity: ${quantity} pcs\nProduction Timeline: ${timeline}\nEstimated Price: ${total}\n\nCan you confirm availability and next steps?`;

            const encodedMessage = encodeURIComponent(message);
            window.open(`https://wa.me/60182630390?text=${encodedMessage}`, '_blank');
        });
    }

});

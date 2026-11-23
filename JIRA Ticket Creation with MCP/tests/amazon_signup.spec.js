const { test, expect } = require('@playwright/test');

test.describe('Amazon.in Signup Test Cases', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to the registration page directly to avoid captchas if possible
        await page.goto('https://www.amazon.in/ap/register?openid.pape.max_auth_age=0&openid.return_to=https%3A%2F%2Fwww.amazon.in%2F%3Fref_%3Dnav_newcust&openid.identity=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select&openid.assoc_handle=inflex&openid.mode=checkid_setup&openid.claimed_id=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select&openid.ns=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0');
    });

    test('TestCase 9: Missing Mandatory Fields Check', async ({ page }) => {
        // Don't fill anything, just click "Verify mobile number" / "Continue"
        await page.locator('#continue').click();
        
        // Check for error messages
        await expect(page.locator('#auth-customerName-missing-alert')).toBeVisible();
        await expect(page.locator('#auth-email-missing-alert')).toBeVisible();
        await expect(page.locator('#auth-password-missing-alert')).toBeVisible();
    });

    test('TestCase 7: Invalid Mobile Number Format', async ({ page }) => {
        await page.locator('#ap_customer_name').fill('John Doe');
        await page.locator('#ap_email').fill('12345'); // Invalid length
        await page.locator('#ap_password').fill('Amazon@123!');
        await page.locator('#continue').click();
        
        // Assert error message for invalid mobile
        await expect(page.locator('#auth-email-invalid-claim-alert')).toBeVisible();
    });

    test('TestCase 8: Invalid Email Address Format', async ({ page }) => {
        await page.locator('#ap_customer_name').fill('John Doe');
        await page.locator('#ap_email').fill('johndoe@com'); // Invalid email
        await page.locator('#ap_password').fill('Amazon@123!');
        await page.locator('#continue').click();
        
        // Assert error message for invalid email
        await expect(page.locator('#auth-email-invalid-claim-alert')).toBeVisible();
    });

    test('TestCase 10: Password Criteria Not Met', async ({ page }) => {
        await page.locator('#ap_customer_name').fill('John Doe');
        await page.locator('#ap_email').fill('john.doe.invalid.123@gmail.com');
        await page.locator('#ap_password').fill('short'); // Less than 6 characters
        await page.locator('#continue').click();
        
        // Assert error message for password length
        await expect(page.locator('#auth-password-invalid-password-alert')).toBeVisible();
    });

    test('TestCase 6: Signup with Already Registered Details', async ({ page }) => {
        await page.locator('#ap_customer_name').fill('John Doe');
        // Let's use a very common number that might be registered, or a typical fake number that triggers Amazon validation
        // In real environments, this would be a strictly configured test data.
        await page.locator('#ap_email').fill('8888888888'); 
        await page.locator('#ap_password').fill('Amazon@123!');
        await page.locator('#continue').click();
        
        // Should show some warning about account existing
        // This assertion might fail depending on what Amazon returns for 8888888888
        await expect(page.locator('.a-alert-content')).toContainText('account already exists', { ignoreCase: true });
    });
});

#import <SafariServices/SafariServices.h>
#import <WebKit/WebKit.h>
#import "UnityAppController.h"

@interface StoreViewController : UIViewController <SFSafariViewControllerDelegate, WKNavigationDelegate>
@property(nonatomic, strong) SFSafariViewController *safariVC;
@property(nonatomic, strong) UIViewController *wkWrapper;
@property(nonatomic, strong) WKWebView *wkWebView;
@end

@implementation StoreViewController

+ (instancetype)sharedInstance {
    static StoreViewController *shared = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        shared = [[self alloc] init];
    });
    return shared;
}

- (void)openCheckout:(NSString *)urlString {
    NSURL *url = [NSURL URLWithString:urlString];
    if (!url) return;
    
    dispatch_async(dispatch_get_main_queue(), ^{
        UIViewController *rootVC = UnityGetGLViewController();
#if defined(USE_WKWEBVIEW)
    // WKWebView
    self.wkWrapper = [UIViewController new];
    self.wkWebView = [[WKWebView alloc] initWithFrame:rootVC.view.bounds];
    self.wkWebView.navigationDelegate = self;
    self.wkWebView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;

    [self.wkWrapper.view addSubview:self.wkWebView];
    NSURLRequest *request = [NSURLRequest requestWithURL:url];
    [self.wkWebView loadRequest:request];
    [rootVC presentViewController:self.wkWrapper animated:YES completion:nil];
#else
    // SafariViewController
    self.safariVC = [[SFSafariViewController alloc] initWithURL:url];
    self.safariVC.delegate = self;
    [rootVC presentViewController:self.safariVC animated:YES completion:nil];
#endif
    });
}

#pragma mark - Safari Delegate (Device)

- (void)safariViewController:(SFSafariViewController *)controller
 initialLoadDidRedirectToURL:(NSURL *)URL {
    if ([URL.scheme.lowercaseString isEqualToString:@"fastspring"]) {
        [controller dismissViewControllerAnimated:YES completion:nil];
        
        const char *cUrl = [URL.absoluteString UTF8String];
        UnitySendMessage("DeeplinkHandler", "OnDeepLinkActivated", cUrl);
    }
}

#pragma mark - WKNavigationDelegate (Simulator)

- (void)webView:(WKWebView *)webView
decidePolicyForNavigationAction:(WKNavigationAction *)navigationAction
decisionHandler:(void (^)(WKNavigationActionPolicy))decisionHandler {
    NSURL *URL = navigationAction.request.URL;
    if ([URL.scheme.lowercaseString isEqualToString:@"fastspring"]) {
        [self.wkWrapper dismissViewControllerAnimated:YES completion:nil];
        
        const char *cUrl = [URL.absoluteString UTF8String];
        UnitySendMessage("DeeplinkHandler", "OnDeepLinkActivated", cUrl);
        
        decisionHandler(WKNavigationActionPolicyCancel);
        return;
    }
    decisionHandler(WKNavigationActionPolicyAllow);
}

@end

// Unity bridge
extern "C" {
void OpenSafariCheckout(const char *url) {
    [[StoreViewController sharedInstance] openCheckout:[NSString stringWithUTF8String:url]];
}
}

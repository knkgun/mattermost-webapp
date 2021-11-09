// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {Overlay} from 'react-bootstrap';
import {FormattedMessage} from 'react-intl';

import {trackEvent} from 'actions/telemetry_actions.jsx';
import Constants from 'utils/constants';
import {t} from 'utils/i18n';
import PulsatingDot from 'components/widgets/pulsating_dot';

import TutorialTipBackdrop, {TutorialTipPunchout} from './tutorial_tip_backdrop';

const Preferences = Constants.Preferences;
const OnBoardingTutorialStep = Constants.TutorialSteps;
const TutorialSteps = {
    [Preferences.TUTORIAL_STEP]: Constants.TutorialSteps,
    [Preferences.CRT_TUTORIAL_STEP]: Constants.CrtTutorialSteps,
};

type Preference = {
    user_id: string;
    category: string;
    name: string;
    value: string;
}

type ValueOf<T> = T[keyof T];
type Props = {
    currentUserId: string;

    // the current tour tip state in redux state
    currentStep: number;

    // the step that an instance of TutorialTip is tied to, e.g.
    step: ValueOf<typeof OnBoardingTutorialStep>;
    singleTip?: boolean;
    showOptOut?: boolean;
    screens: JSX.Element[];
    placement: string;
    overlayClass: string;
    telemetryTag?: string;
    stopPropagation?: boolean;
    preventDefault?: boolean;
    tutorialCategory?: string;
    onNextNavigateTo?: () => void;
    onPrevNavigateTo?: () => void;
    actions: {
        closeRhsMenu: () => void;
        savePreferences: (currentUserId: string, preferences: Preference[]) => void;
    };
    autoTour: boolean;
    punchOut?: TutorialTipPunchout | null;
}

type State = {
    currentScreen: number;
    show: boolean;

    // give auto tour a chance to engage
    hasShown: boolean;
}

const COMPROMISE_WAIT_FOR_TIPS_AND_NEXT_STEPS_TIME = 150;

export default class TutorialTip extends React.PureComponent<Props, State> {
    public targetRef: React.RefObject<HTMLImageElement>;
    private showPendingTimeout?: NodeJS.Timeout;

    public static defaultProps: Partial<Props> = {
        overlayClass: '',
    }

    public constructor(props: Props) {
        super(props);
        this.state = {
            currentScreen: 0,
            show: false,
            hasShown: false,
        };

        this.targetRef = React.createRef();
    }

    private show = (e?: React.MouseEvent): void => {
        this.setState({show: true, hasShown: true});
        if (this.props.preventDefault && e) {
            e.preventDefault();
        }
        if (this.props.stopPropagation && e) {
            e.stopPropagation();
        }
    }

    private hide = (): void => {
        this.setState({show: false});
    }

    private dismiss = (e: React.MouseEvent | React.KeyboardEvent): void => {
        this.hide();
        const wasEscapeDismissal = e.type === 'keyup';
        const tag = this.props.telemetryTag + '_dismiss';
        if (wasEscapeDismissal) {
            trackEvent('tutorial', tag);
            return;
        }
        const target = e.target as HTMLElement;

        // We defer checking this until here because `.closest` is mildly expensive.
        const wasOutsideClick = (

            // If a user click on an element inside triggers a click outside,
            // then react-bootstrap's onHide fires onHide for both elements.
            // Even if the inside click is for opt out, that is already covered in the _skip event
            !target.closest('.tip-overlay') &&

            // Clicking the post textbox means a prefilled message was chosen, so it is not a dismissal.
            target.id !== 'post_textbox'
        );
        if (wasOutsideClick) {
            trackEvent('tutorial', tag);
        }
    }

    private autoShow(couldAutoShow: boolean) {
        if (!couldAutoShow) {
            return;
        }
        const isShowable = (this.props.autoTour || this.props.tutorialCategory) && !this.state.hasShown && this.props.currentStep === this.props.step;
        if (isShowable) {
            // POST_POPOVER is the only tip that is not automatically rendered if it is the currentStep.
            // This is because tips and next steps may display.
            // It can further happen that the post popover gets the first chance to display,
            // and then tips and next steps determines it should display.
            // So this is tutorial_tip's way of being polite to the user and not flashing its tip
            // in the user's face right before showing tips and next steps.
            if (this.props.step === OnBoardingTutorialStep.POST_POPOVER) {
                this.showPendingTimeout = setTimeout(() => {
                    this.show();
                }, COMPROMISE_WAIT_FOR_TIPS_AND_NEXT_STEPS_TIME);
            } else {
                this.show();
            }
        }
    }

    public handlePrev = (): void => {
        const {currentUserId, tutorialCategory, actions} = this.props;
        const {closeRhsMenu, savePreferences} = actions;

        const preferences = [{
            user_id: currentUserId,
            category: tutorialCategory || Preferences.TUTORIAL_STEP,
            name: currentUserId,
            value: (this.props.currentStep - 1).toString(),
        }];

        if (!tutorialCategory) {
            closeRhsMenu();
        }
        this.hide();

        savePreferences(currentUserId, preferences);
        const {onPrevNavigateTo} = this.props;
        if (onPrevNavigateTo) {
            onPrevNavigateTo();
        }
    }

    public handleNext = (): void => {
        if (this.state.currentScreen < this.props.screens.length - 1) {
            this.setState({currentScreen: this.state.currentScreen + 1});
            return;
        }

        if (this.props.telemetryTag) {
            let tag = this.props.telemetryTag;

            if (this.props.screens.length > 1) {
                tag += '_' + (this.state.currentScreen + 1).toString();
            }

            if (this.state.currentScreen === this.props.screens.length - 1) {
                tag += '_okay';
            } else {
                tag += '_next';
            }

            trackEvent('tutorial', tag);
        }

        const {currentUserId, tutorialCategory, actions} = this.props;
        const {closeRhsMenu, savePreferences} = actions;

        const preferences = [{
            user_id: currentUserId,
            category: tutorialCategory || Preferences.TUTORIAL_STEP,
            name: currentUserId,
            value: (this.props.currentStep + 1).toString(),
        }];

        if (!tutorialCategory) {
            closeRhsMenu();
        }
        this.hide();

        savePreferences(currentUserId, preferences);
        const {onNextNavigateTo} = this.props;
        if (onNextNavigateTo) {
            onNextNavigateTo();
        }
    }

    public skipTutorial = (e: React.MouseEvent<HTMLAnchorElement>): void => {
        e.preventDefault();

        if (this.props.telemetryTag) {
            let tag = this.props.telemetryTag;
            if (this.props.screens.length > 1) {
                tag += '_' + this.state.currentScreen;
            }
            tag += '_skip';
            trackEvent('tutorial', tag);
        }

        const {currentUserId, tutorialCategory, actions} = this.props;
        const preferences = [{
            user_id: currentUserId,
            category: tutorialCategory || Preferences.TUTORIAL_STEP,
            name: currentUserId,
            value: OnBoardingTutorialStep.FINISHED.toString(),
        }];

        actions.savePreferences(currentUserId, preferences);
    }

    private handleCircleClick = (e: React.MouseEvent<HTMLAnchorElement>, screen: number): void => {
        e.preventDefault();
        this.setState({currentScreen: screen});
    }

    private getTarget = (): HTMLImageElement | null => {
        return this.targetRef.current;
    }

    private getLastStep(tutorialSteps: Record<string, number>) {
        return Object.values(tutorialSteps).reduce((maxStep, candidateMaxStep) => {
            // ignore the "opt out" FINISHED step as the max step.
            if (candidateMaxStep > maxStep && candidateMaxStep !== tutorialSteps.FINISHED) {
                return candidateMaxStep;
            }
            return maxStep;
        }, Number.MIN_SAFE_INTEGER);
    }

    private getButtonText(category: string): JSX.Element {
        let buttonText = (
            <>
                <FormattedMessage
                    id={t('tutorial_tip.ok')}
                    defaultMessage='Next'
                />
                <i className='icon icon-chevron-right'/>
            </>
        );
        if (this.props.singleTip) {
            buttonText = (
                <FormattedMessage
                    id={t('tutorial_tip.got_it')}
                    defaultMessage='Got it'
                />
            );
            return buttonText;
        }

        const lastStep = this.getLastStep(TutorialSteps[category]);
        if (this.props.step === lastStep) {
            buttonText = (
                <FormattedMessage
                    id={t('tutorial_tip.finish_tour')}
                    defaultMessage='Finish tour'
                />
            );
        }

        return buttonText;
    }

    public componentDidMount() {
        this.autoShow(true);
    }

    public componentDidUpdate(prevProps: Props) {
        const currentStepChanged = prevProps.currentStep !== this.props.currentStep;
        const autoTourChanged = prevProps.autoTour !== this.props.autoTour;
        this.autoShow(currentStepChanged || autoTourChanged);
    }

    public componentWillUnmount() {
        if (this.showPendingTimeout) {
            clearTimeout(this.showPendingTimeout);
        }
    }

    public render(): JSX.Element {
        const dots = [];
        const tourSteps = this.props.tutorialCategory ? TutorialSteps[this.props.tutorialCategory] : null;
        if (!this.props.singleTip && tourSteps) {
            for (let i = 0; i < (Object.values(tourSteps).length - 1); i++) {
                let className = 'circle';

                if (i === this.props.currentStep) {
                    className += ' active';
                }

                dots.push(
                    <a
                        href='#'
                        key={'dotactive' + i}
                        className={className}
                        data-screen={i}
                        onClick={(e) => this.handleCircleClick(e, i)}
                    />,
                );
            }
        }

        return (
            <div
                id='tipButton'
                className={'tip-div ' + this.props.overlayClass}
                onClick={this.show}
            >
                <PulsatingDot
                    onClick={this.show}
                    targetRef={this.targetRef}
                />

                <Overlay
                    show={this.state.show}
                >
                    <TutorialTipBackdrop
                        x={this.props.punchOut?.x}
                        y={this.props.punchOut?.y}
                        width={this.props.punchOut?.width}
                        height={this.props.punchOut?.height}
                    />
                </Overlay>

                <Overlay
                    placement={this.props.placement}
                    show={this.state.show}
                    rootClose={true}
                    onHide={this.dismiss}
                    target={this.getTarget}
                >
                    <div className={'tip-overlay ' + this.props.overlayClass}>
                        <div className='arrow'/>
                        {this.props.screens[this.state.currentScreen]}
                        <div className='tutorial__footer'>
                            <div className='tutorial__circles'>{dots}</div>
                            <div className='text-right'>
                                <div className={'tutorial-tip__btn-ctr'}>
                                    { (this.props.currentStep !== 0) &&
                                    <button
                                        id='tipPreviousButton'
                                        className='tutorial-tip__btn tutorial-tip__cancel-btn'
                                        onClick={this.handlePrev}
                                    >
                                        <i className='icon icon-chevron-left'/>
                                        <FormattedMessage
                                            id='generic.previous'
                                            defaultMessage='Previous'
                                        />
                                    </button>}
                                    <button
                                        id='tipNextButton'
                                        className='tutorial-tip__btn tutorial-tip__confirm-btn'
                                        onClick={this.handleNext}
                                    >
                                        {this.getButtonText(this.props.tutorialCategory || Preferences.TUTORIAL_STEP)}
                                    </button>
                                </div>
                                {this.props.showOptOut && <div className='tip-opt'>
                                    <FormattedMessage
                                        id='tutorial_tip.seen'
                                        defaultMessage='Seen this before? '
                                    />
                                    <a
                                        href='#'
                                        onClick={this.skipTutorial}
                                    >
                                        <FormattedMessage
                                            id='tutorial_tip.out'
                                            defaultMessage='Opt out of these tips.'
                                        />
                                    </a>
                                </div>}
                            </div>
                        </div>
                    </div>
                </Overlay>
            </div>
        );
    }
}

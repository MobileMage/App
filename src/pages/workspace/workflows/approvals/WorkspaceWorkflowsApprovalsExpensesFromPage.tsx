import React, {useCallback, useEffect, useMemo, useState} from 'react';
import type {SectionListData} from 'react-native';
import {useOnyx} from 'react-native-onyx';
import Badge from '@components/Badge';
import BlockingView from '@components/BlockingViews/BlockingView';
import FullPageNotFoundView from '@components/BlockingViews/FullPageNotFoundView';
import FormAlertWithSubmitButton from '@components/FormAlertWithSubmitButton';
import HeaderWithBackButton from '@components/HeaderWithBackButton';
import {FallbackAvatar} from '@components/Icon/Expensicons';
import * as Illustrations from '@components/Icon/Illustrations';
import {useOptionsList} from '@components/OptionListContextProvider';
import ScreenWrapper from '@components/ScreenWrapper';
import SelectionList from '@components/SelectionList';
import InviteMemberListItem from '@components/SelectionList/InviteMemberListItem';
import type {Section} from '@components/SelectionList/types';
import Text from '@components/Text';
import useDebouncedState from '@hooks/useDebouncedState';
import useLocalize from '@hooks/useLocalize';
import useThemeStyles from '@hooks/useThemeStyles';
import {setWorkspaceInviteMembersDraft} from '@libs/actions/Policy/Member';
import {searchInServer} from '@libs/actions/Report';
import {setApprovalWorkflowMembers} from '@libs/actions/Workflow';
import {canUseTouchScreen} from '@libs/DeviceCapabilities';
import Navigation from '@libs/Navigation/Navigation';
import type {PlatformStackScreenProps} from '@libs/Navigation/PlatformStackNavigation/types';
import type {WorkspaceSplitNavigatorParamList} from '@libs/Navigation/types';
import {filterAndOrderOptions, formatMemberForList, getMemberInviteOptions, getSearchValueForPhoneOrEmail, sortAlphabetically} from '@libs/OptionsListUtils';
import {getIneligibleInvitees, getMemberAccountIDsForWorkspace, goBackFromInvalidPolicy, isPendingDeletePolicy, isPolicyAdmin} from '@libs/PolicyUtils';
import type {OptionData} from '@libs/ReportUtils';
import tokenizedSearch from '@libs/tokenizedSearch';
import AccessOrNotFoundWrapper from '@pages/workspace/AccessOrNotFoundWrapper';
import withPolicyAndFullscreenLoading from '@pages/workspace/withPolicyAndFullscreenLoading';
import type {WithPolicyAndFullscreenLoadingProps} from '@pages/workspace/withPolicyAndFullscreenLoading';
import variables from '@styles/variables';
import CONST from '@src/CONST';
import ONYXKEYS from '@src/ONYXKEYS';
import ROUTES from '@src/ROUTES';
import type SCREENS from '@src/SCREENS';
import type {Member} from '@src/types/onyx/ApprovalWorkflow';
import type {Icon} from '@src/types/onyx/OnyxCommon';
import {isEmptyObject} from '@src/types/utils/EmptyObject';
import isLoadingOnyxValue from '@src/types/utils/isLoadingOnyxValue';

type SelectionListMember = {
    text: string;
    alternateText: string;
    keyForList: string;
    isSelected: boolean;
    login: string;
    rightElement?: React.ReactNode;
    icons?: Icon[];
};

type MembersSection = SectionListData<SelectionListMember, Section<SelectionListMember>>;

type WorkspaceWorkflowsApprovalsExpensesFromPageProps = WithPolicyAndFullscreenLoadingProps &
    PlatformStackScreenProps<WorkspaceSplitNavigatorParamList, typeof SCREENS.WORKSPACE.WORKFLOWS_APPROVALS_EXPENSES_FROM>;

function WorkspaceWorkflowsApprovalsExpensesFromPage({policy, isLoadingReportData = true, route}: WorkspaceWorkflowsApprovalsExpensesFromPageProps) {
    const styles = useThemeStyles();
    const {translate} = useLocalize();
    const [searchTerm, debouncedSearchTerm, setSearchTerm] = useDebouncedState('');
    const [approvalWorkflow, approvalWorkflowResults] = useOnyx(ONYXKEYS.APPROVAL_WORKFLOW, {canBeMissing: true});
    const isLoadingApprovalWorkflow = isLoadingOnyxValue(approvalWorkflowResults);
    const [selectedMembers, setSelectedMembers] = useState<SelectionListMember[]>([]);
    const [personalDetails, setPersonalDetails] = useState<OptionData[]>([]);
    const [usersToInvite, setUsersToInvite] = useState<OptionData[]>([]);
    const [didScreenTransitionEnd, setDidScreenTransitionEnd] = useState(false);
    const [betas] = useOnyx(ONYXKEYS.BETAS);
    const [isSearchingForReports] = useOnyx(ONYXKEYS.IS_SEARCHING_FOR_REPORTS, {initWithStoredValues: false});

    // eslint-disable-next-line rulesdir/no-negated-variables
    const shouldShowNotFoundView = (isEmptyObject(policy) && !isLoadingReportData) || !isPolicyAdmin(policy) || isPendingDeletePolicy(policy);
    const isInitialCreationFlow = approvalWorkflow?.action === CONST.APPROVAL_WORKFLOW.ACTION.CREATE && !route.params.backTo;
    const shouldShowListEmptyContent = !isLoadingApprovalWorkflow && approvalWorkflow && approvalWorkflow.availableMembers.length === 0;
    const firstApprover = approvalWorkflow?.approvers?.[0]?.email ?? '';

    useEffect(() => {
        if (!approvalWorkflow?.members) {
            return;
        }

        setSelectedMembers(
            approvalWorkflow.members.map((member) => {
                const policyMemberEmailsToAccountIDs = getMemberAccountIDsForWorkspace(policy?.employeeList);
                const accountID = Number(policyMemberEmailsToAccountIDs[member.email] ?? '');
                const isAdmin = policy?.employeeList?.[member.email]?.role === CONST.REPORT.ROLE.ADMIN;

                return {
                    text: member.displayName,
                    alternateText: member.email,
                    keyForList: member.email,
                    isSelected: true,
                    login: member.email,
                    icons: [{source: member.avatar ?? FallbackAvatar, type: CONST.ICON_TYPE_AVATAR, name: member.displayName, id: accountID}],
                    rightElement: isAdmin ? <Badge text={translate('common.admin')} /> : undefined,
                };
            }),
        );
    }, [approvalWorkflow?.members, policy?.employeeList, translate]);

    const {options, areOptionsInitialized} = useOptionsList({
        shouldInitialize: didScreenTransitionEnd,
    });

    const excludedUsers = useMemo(() => {
        const ineligibleInvites = getIneligibleInvitees(policy?.employeeList);
        return ineligibleInvites.reduce(
            (acc, login) => {
                acc[login] = true;
                return acc;
            },
            {} as Record<string, boolean>,
        );
    }, [policy?.employeeList]);

    const defaultOptions = useMemo(() => {
        if (!areOptionsInitialized) {
            return {recentReports: [], personalDetails: [], userToInvite: null, currentUserOption: null};
        }

        const inviteOptions = getMemberInviteOptions(options.personalDetails, betas ?? [], excludedUsers, true);
        return {...inviteOptions, recentReports: [], currentUserOption: null};
    }, [areOptionsInitialized, betas, excludedUsers, options.personalDetails]);

    const inviteOptions = useMemo(() => filterAndOrderOptions(defaultOptions, debouncedSearchTerm, {excludeLogins: excludedUsers}), [debouncedSearchTerm, defaultOptions, excludedUsers]);
    const approversEmail = useMemo(() => approvalWorkflow?.approvers.map((member) => member?.email), [approvalWorkflow?.approvers]);
    const sections: MembersSection[] = useMemo(() => {
        const uniqueMembersMap: Record<string, SelectionListMember> = {};

        // Add existing workspace members
        if (approvalWorkflow?.availableMembers) {
            approvalWorkflow.availableMembers.forEach((member) => {
                const isAdmin = policy?.employeeList?.[member.email]?.role === CONST.REPORT.ROLE.ADMIN;
                const policyMemberEmailsToAccountIDs = getMemberAccountIDsForWorkspace(policy?.employeeList);
                const accountID = Number(policyMemberEmailsToAccountIDs[member.email] ?? '');

                const formattedMember = {
                    text: member.displayName,
                    alternateText: member.email,
                    keyForList: member.email,
                    isSelected: false,
                    login: member.email,
                    icons: [{source: member.avatar ?? FallbackAvatar, type: CONST.ICON_TYPE_AVATAR, name: member.displayName, id: accountID}],
                    rightElement: isAdmin ? <Badge text={translate('common.admin')} /> : undefined,
                };

                // Add to map only if not already present and not excluded by self-approval policy
                if (!uniqueMembersMap[member.email] && (!policy?.preventSelfApproval || !approversEmail?.includes(member.email))) {
                    uniqueMembersMap[member.email] = formattedMember;
                }
            });
        }

        selectedMembers.forEach((member) => {
            uniqueMembersMap[member.login] = {
                ...uniqueMembersMap[member.login],
                ...member,
                isSelected: true,
            };
        });

        if (areOptionsInitialized) {
            personalDetails.forEach((item) => {
                const login = item.login ?? '';
                if (login && !uniqueMembersMap[login]) {
                    uniqueMembersMap[login] = {
                        text: item.text ?? '',
                        alternateText: login,
                        keyForList: login,
                        isSelected: false,
                        login,
                        icons: item.icons,
                        rightElement: undefined,
                    };
                }
            });
        }

        // Add user to invite from search
        usersToInvite.forEach((userToInvite) => {
            const login = userToInvite.login ?? '';
            if (login && !uniqueMembersMap[login]) {
                uniqueMembersMap[login] = formatMemberForList(userToInvite);
            }
        });

        const allMembers = Object.values(uniqueMembersMap);
        const filteredMembers =
            debouncedSearchTerm !== '' ? tokenizedSearch(allMembers, getSearchValueForPhoneOrEmail(debouncedSearchTerm), (option) => [option.text ?? '', option.login ?? '']) : allMembers;

        return [
            {
                title: undefined,
                data: sortAlphabetically(filteredMembers, 'text'),
                shouldShow: true,
            },
        ];
    }, [
        approvalWorkflow?.availableMembers,
        debouncedSearchTerm,
        policy?.preventSelfApproval,
        policy?.employeeList,
        selectedMembers,
        translate,
        approversEmail,
        areOptionsInitialized,
        personalDetails,
        usersToInvite,
    ]);

    useEffect(() => {
        if (!areOptionsInitialized) {
            return;
        }

        const newUsersToInviteDict: Record<number, OptionData> = {};
        const newPersonalDetailsDict: Record<number, OptionData> = {};
        const userToInvite = inviteOptions.userToInvite;

        if (typeof userToInvite?.accountID === 'number') {
            newUsersToInviteDict[userToInvite.accountID] = userToInvite;
        }

        inviteOptions.personalDetails.forEach((details) => {
            if (typeof details.accountID !== 'number') {
                return;
            }
            newPersonalDetailsDict[details.accountID] = details;
        });

        setUsersToInvite(Object.values(newUsersToInviteDict));
        setPersonalDetails(Object.values(newPersonalDetailsDict));
    }, [areOptionsInitialized, inviteOptions.personalDetails, inviteOptions.userToInvite]);

    useEffect(() => {
        searchInServer(debouncedSearchTerm);
    }, [debouncedSearchTerm]);

    const goBack = useCallback(() => {
        let backTo;
        if (approvalWorkflow?.action === CONST.APPROVAL_WORKFLOW.ACTION.EDIT) {
            backTo = ROUTES.WORKSPACE_WORKFLOWS_APPROVALS_EDIT.getRoute(route.params.policyID, firstApprover);
        } else if (!isInitialCreationFlow) {
            backTo = ROUTES.WORKSPACE_WORKFLOWS_APPROVALS_NEW.getRoute(route.params.policyID);
        }
        Navigation.goBack(backTo);
    }, [isInitialCreationFlow, route.params.policyID, firstApprover, approvalWorkflow?.action]);

    const nextStep = useCallback(() => {
        const members: Member[] = selectedMembers.map((member) => ({
            displayName: member.text,
            avatar: member.icons?.[0]?.source === FallbackAvatar ? undefined : member.icons?.[0]?.source,
            email: member.login,
        }));
        setApprovalWorkflowMembers(members);
    
        const workspaceEmails = Object.keys(policy?.employeeList ?? {});
        const nonWorkspaceMembers = selectedMembers.filter((member) => !workspaceEmails.includes(member.login));
    
        if (nonWorkspaceMembers.length > 0) {
            const invitedEmailsToAccountIDs: Record<string, number> = {};
            
            nonWorkspaceMembers.forEach((member, index) => {
                const login = member.login;
                const personalDetail = personalDetails.find((p) => p.login === login);
                const userToInvite = usersToInvite.find((u) => u.login === login);
                const accountID = personalDetail?.accountID ?? userToInvite?.accountID ?? (CONST.DEFAULT_NUMBER_ID - index - 1);
            
                if (login.toLowerCase().trim()) {
                    invitedEmailsToAccountIDs[login] = Number(accountID);
                }
            });
    
            if (Object.keys(invitedEmailsToAccountIDs).length > 0) {
                setWorkspaceInviteMembersDraft(route.params.policyID, invitedEmailsToAccountIDs);
    
                // Define the route to navigate to after the invitation is complete.
                // Using `nextRoute` for clarity, as it represents the next step in the workflow.
                const nextRoute = isInitialCreationFlow
                    ? ROUTES.WORKSPACE_WORKFLOWS_APPROVALS_APPROVER.getRoute(route.params.policyID, 0)
                    : ROUTES.WORKSPACE_WORKFLOWS_APPROVALS_EDIT.getRoute(route.params.policyID, firstApprover);
    
                // Navigate to invite message page. The `WorkspaceInviteMessagePage` will use the `backTo` parameter
                // to navigate to the route we specify in `nextRoute` after the invitation is sent.
                Navigation.navigate(ROUTES.WORKSPACE_INVITE_MESSAGE.getRoute(route.params.policyID, nextRoute));
                return;
            }
        }
    
        if (isInitialCreationFlow) {
            Navigation.navigate(ROUTES.WORKSPACE_WORKFLOWS_APPROVALS_APPROVER.getRoute(route.params.policyID, 0));
        } else {
            goBack();
        }
    }, [route.params.policyID, selectedMembers, isInitialCreationFlow, goBack, policy?.employeeList, personalDetails, usersToInvite, firstApprover]);

    const button = useMemo(() => {
        let buttonText = isInitialCreationFlow ? translate('common.next') : translate('common.save');

        if (shouldShowListEmptyContent) {
            buttonText = translate('common.buttonConfirm');
        }

        return (
            <FormAlertWithSubmitButton
                isDisabled={!shouldShowListEmptyContent && !selectedMembers.length}
                buttonText={buttonText}
                onSubmit={shouldShowListEmptyContent ? () => Navigation.goBack() : nextStep}
                containerStyles={[styles.flexReset, styles.flexGrow0, styles.flexShrink0, styles.flexBasisAuto]}
                enabledWhenOffline
            />
        );
    }, [isInitialCreationFlow, nextStep, selectedMembers.length, shouldShowListEmptyContent, styles.flexBasisAuto, styles.flexGrow0, styles.flexReset, styles.flexShrink0, translate]);

    const toggleMember = useCallback((member: SelectionListMember) => {
        const isAlreadySelected = selectedMembers.some((selectedOption) => selectedOption.login === member.login);
        setSelectedMembers(isAlreadySelected ? selectedMembers.filter((selectedOption) => selectedOption.login !== member.login) : [...selectedMembers, {...member, isSelected: true}]);
    }, [selectedMembers]);

    const headerMessage = useMemo(() => (searchTerm && !sections.at(0)?.data?.length ? translate('common.noResultsFound') : ''), [searchTerm, sections, translate]);

    const listEmptyContent = useMemo(
        () => (
            <BlockingView
                icon={Illustrations.TurtleInShell}
                iconWidth={variables.emptyListIconWidth}
                iconHeight={variables.emptyListIconHeight}
                title={translate('workflowsPage.emptyContent.title')}
                subtitle={translate('workflowsPage.emptyContent.expensesFromSubtitle')}
                subtitleStyle={styles.textSupporting}
                containerStyle={styles.pb10}
                contentFitImage="contain"
            />
        ),
        [translate, styles.textSupporting, styles.pb10],
    );

    return (
        <AccessOrNotFoundWrapper
            policyID={route.params.policyID}
            featureName={CONST.POLICY.MORE_FEATURES.ARE_WORKFLOWS_ENABLED}
        >
            <ScreenWrapper
                testID={WorkspaceWorkflowsApprovalsExpensesFromPage.displayName}
                enableEdgeToEdgeBottomSafeAreaPadding
                onEntryTransitionEnd={() => setDidScreenTransitionEnd(true)}
            >
                <FullPageNotFoundView
                    shouldShow={shouldShowNotFoundView}
                    subtitleKey={isEmptyObject(policy) ? undefined : 'workspace.common.notAuthorized'}
                    onBackButtonPress={goBackFromInvalidPolicy}
                    onLinkPress={goBackFromInvalidPolicy}
                    addBottomSafeAreaPadding
                >
                    <HeaderWithBackButton
                        title={translate('workflowsExpensesFromPage.title')}
                        onBackButtonPress={goBack}
                    />

                    {approvalWorkflow?.action === CONST.APPROVAL_WORKFLOW.ACTION.CREATE && !shouldShowListEmptyContent && (
                        <Text style={[styles.textHeadlineH1, styles.mh5, styles.mv3]}>{translate('workflowsExpensesFromPage.header')}</Text>
                    )}
                    <SelectionList
                        canSelectMultiple
                        sections={sections}
                        ListItem={InviteMemberListItem}
                        textInputLabel={shouldShowListEmptyContent ? undefined : translate('selectionList.findMember')}
                        textInputValue={searchTerm}
                        onChangeText={setSearchTerm}
                        headerMessage={headerMessage}
                        onSelectRow={toggleMember}
                        showScrollIndicator
                        shouldPreventDefaultFocusOnSelectRow={!canUseTouchScreen()}
                        footerContent={button}
                        listEmptyContent={listEmptyContent}
                        shouldShowListEmptyContent={shouldShowListEmptyContent}
                        showLoadingPlaceholder={isLoadingApprovalWorkflow}
                        isLoadingNewOptions={!!isSearchingForReports}
                        addBottomSafeAreaPadding
                    />
                </FullPageNotFoundView>
            </ScreenWrapper>
        </AccessOrNotFoundWrapper>
    );
}

WorkspaceWorkflowsApprovalsExpensesFromPage.displayName = 'WorkspaceWorkflowsApprovalsExpensesFromPage';

export default withPolicyAndFullscreenLoading(WorkspaceWorkflowsApprovalsExpensesFromPage);